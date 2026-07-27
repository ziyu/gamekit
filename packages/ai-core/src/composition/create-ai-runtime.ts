import { createAiError } from "../contracts/errors";
import { createAiNavigationAccess } from "../contracts/navigation-access";
import { createAiPhysicsQueries } from "../contracts/physics-queries";
import { createAiSharedFactQueries } from "../contracts/shared-fact-queries";
import { createAiWorldReadModel } from "../contracts/world-read-model";
import type { AiAgentState } from "../controller/agent-state";
import { createAiAgentContextFactory } from "../controller/agent-context-factory";
import { createAiAgentState } from "../controller/create-agent-state";
import { createAiGoalController } from "../controller/goal-controller";
import type { AiRuntime } from "../controller/runtime";
import { pruneAiGoalCooldowns } from "../decision/cooldowns";
import type { AiGoalScore } from "../decision/utility";
import { createAiAgentDefinitionCompiler } from "../definition/agent-definition-compiler";
import type { AiGoalDefinition } from "../definition/goal-definition";
import type { AiTaskDefinition } from "../definition/task-definition";
import {
  projectAiAgentSnapshot,
  projectAiRuntimeSnapshot
} from "../observability/snapshot-projection";
import { createAiTraceRecorder } from "../observability/trace-recorder";
import { createAiTraceStore } from "../observability/trace-store";
import { pruneAiPerceptionMemory, retainAiPerceptionFacts } from "../perception/perception-memory";
import { createAiPerceptionController } from "../perception/perception-controller";
import {
  projectAiAgentCheckpoint,
  restoreAiAgentCheckpoint
} from "../persistence/checkpoint-projection";
import { validateAiCheckpointCompatibility } from "../persistence/checkpoint-compatibility";
import { validateAiRuntimeCheckpoint } from "../persistence/checkpoint-validation";
import { restoreAiAgentBinding } from "../persistence/restore-binding";
import { restoreAiTaskState } from "../persistence/restore-task-state";
import { createAiDecisionScheduler } from "../scheduler/decision-scheduler";
import { reclassifyAiAgent } from "../scheduler/reclassify-agent";
import type { AiSchedulerClass } from "../scheduler/scheduler-class";
import { effectiveAiInterval } from "../scheduler/timing";
import { createAiTaskController, type AiTaskTransition } from "../task/task-controller";
import type { CreateAiRuntimeOptions } from "./options";
import { createAiRegistry } from "./registry";
import { resolveAiRuntimeLimits, resolvePositiveAiInteger } from "./runtime-config";

export function createAiRuntime(options: CreateAiRuntimeOptions): AiRuntime {
  const id = options.id ?? "ai";
  const limits = resolveAiRuntimeLimits(options);
  const world = createAiWorldReadModel(options.world);
  const physics =
    options.physics === undefined ? undefined : createAiPhysicsQueries(options.physics);
  const sharedFacts =
    options.sharedFacts === undefined ? undefined : createAiSharedFactQueries(options.sharedFacts);
  const sensorRegistry = createAiRegistry(options.sensors ?? [], "sensor");
  const inputRegistry = createAiRegistry(options.inputs ?? [], "input");
  const taskRegistry = createAiRegistry(options.tasks ?? [], "task");
  const schedulerClasses = new Map<string, AiSchedulerClass>([
    ["default", { id: "default", decisionIntervalMultiplier: 1, sensorIntervalMultiplier: 1 }]
  ]);
  for (const schedulerClass of options.schedulerClasses ?? []) {
    if (schedulerClasses.has(schedulerClass.id)) {
      throw createAiError(
        "ai.duplicate_registry_entry",
        `Duplicate AI scheduler class: ${schedulerClass.id}`
      );
    }
    schedulerClasses.set(schedulerClass.id, { ...schedulerClass });
  }
  const definitionCompiler = createAiAgentDefinitionCompiler({
    dataRegistry: options.dataRegistry,
    registries: {
      sensors: sensorRegistry,
      inputs: inputRegistry,
      tasks: taskRegistry,
      schedulerClasses
    }
  });
  const traceStore = createAiTraceStore({
    ...limits.traceRetention,
    onEntry: options.onTrace,
    onEntryError: options.onTraceError
  });
  const agents = new Map<string, AiAgentState>();
  let elapsed = 0;
  let disposed = false;
  let intentsEmitted = 0;
  let delayedSensorSamples = 0;
  let delayedDecisions = 0;
  const trace = createAiTraceRecorder({
    store: traceStore,
    enabled: limits.traceProduction.enabled,
    maxEntriesPerUpdate: limits.traceProduction.maxEntriesPerUpdate,
    emitDropSummary: limits.traceProduction.emitDropSummary
  });
  const navigation =
    options.navigation === undefined
      ? undefined
      : createAiNavigationAccess({
          id,
          queries: options.navigation,
          maxRequestsPerUpdate: limits.maxPathRequestsPerTick,
          onRejected(agentId, request) {
            trace.push({
              kind: "budget",
              label: "ai.path_request_rejected",
              timestamp: elapsed,
              agentId,
              payload: { requesterId: request.requesterId, profileId: request.profileId }
            });
          }
        });
  const contextFactory = createAiAgentContextFactory({
    elapsed: () => elapsed,
    world,
    navigationFor: (state) => navigation?.forAgent(state.binding.agentId),
    physics,
    sharedFacts,
    onIntent(state, task, intent) {
      const value = {
        ...intent,
        agentId: state.binding.agentId,
        source: `ai:${task.id}`
      } as Parameters<typeof options.intentSink.emit>[0];
      options.intentSink.emit(value);
      intentsEmitted += 1;
      trace.push({
        kind: "intent",
        label: "ai.intent_emitted",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: { type: value.type, taskId: task.id }
      });
      options.eventBus?.emit("ai.intent", value, id);
    }
  });
  const taskController = createAiTaskController<AiAgentState>({
    elapsed: () => elapsed,
    failureBackoffMs: limits.failureBackoffMs,
    decisionInterval: (state) =>
      effectiveAiInterval(
        state.definition.decisionIntervalMs,
        state.schedulerClass.decisionIntervalMultiplier
      ),
    taskFor,
    goalFor,
    executorFor: (executorId) => taskRegistry.get(executorId),
    contextFor: contextFactory.task,
    onTransition: recordTaskTransition
  });
  const perceptionController = createAiPerceptionController<AiAgentState>({
    elapsed: () => elapsed,
    maxSamplesPerTick: limits.maxSensorSamplesPerTick,
    samplerFor: (samplerId) => sensorRegistry.get(samplerId),
    contextFor: contextFactory.read,
    onSample(state, sensor, facts) {
      trace.push({
        kind: "perception",
        label: "ai.sensor_sampled",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: { sensorId: sensor.id, facts: facts.length }
      });
    },
    onDelayed(state, sensor) {
      trace.push({
        kind: "budget",
        label: "ai.sensor_delayed",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: { sensorId: sensor.id }
      });
    }
  });
  const goalController = createAiGoalController({
    elapsed: () => elapsed,
    resolveInput: (inputId) => inputRegistry.get(inputId),
    readContext: contextFactory.read,
    goalFor,
    tasks: taskController,
    onScores(state, scores) {
      trace.push({
        kind: "decision",
        label: "ai.goals_scored",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: projectGoalScores(scores)
      });
    },
    onDecision(state, decision) {
      trace.push({
        kind: "decision",
        label: "ai.goal_decided",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: {
          action: decision.action,
          reason: decision.reason,
          currentGoalId: state.currentGoalId ?? null,
          candidateGoalId: decision.candidate?.goalId ?? null
        }
      });
    },
    onSelected(state, goal, score) {
      trace.push({
        kind: "goal",
        label: "ai.goal_selected",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: { goalId: goal.id, score }
      });
      options.eventBus?.emit(
        "ai.goal_selected",
        { agentId: state.binding.agentId, goalId: goal.id, score },
        id
      );
    }
  });
  const decisionScheduler = createAiDecisionScheduler<AiAgentState>({
    elapsed: () => elapsed,
    maxDecisionsPerTick: limits.maxDecisionsPerTick,
    onDecision: (state) => goalController.decide(state),
    onDelayed(state) {
      trace.push({
        kind: "budget",
        label: "ai.decision_delayed",
        timestamp: elapsed,
        agentId: state.binding.agentId
      });
    }
  });

  trace.push({ kind: "lifecycle", label: "ai.created", timestamp: elapsed });

  const runtime: AiRuntime = {
    bind(binding) {
      requireActive();
      if (!binding.agentId || agents.has(binding.agentId)) {
        throw createAiError("ai.agent_bound", `AI agent is already bound: ${binding.agentId}`, {
          agentId: binding.agentId
        });
      }
      const compiled = definitionCompiler.compile(binding.definitionId);
      const definition = compiled.definition;
      const state = createAiAgentState({
        binding,
        compiled,
        elapsed,
        blackboardLimit: resolvePositiveAiInteger(
          definition.blackboardLimit,
          limits.defaultBlackboardLimit
        ),
        blackboardValueLimits: limits.blackboardValueLimits
      });
      agents.set(binding.agentId, state);
      trace.push({
        kind: "lifecycle",
        label: "ai.agent_bound",
        timestamp: elapsed,
        agentId: binding.agentId,
        payload: { definitionId: binding.definitionId }
      });
    },
    unbind(agentId, reason = "owner-removed") {
      const state = agents.get(agentId);
      if (state === undefined) {
        return;
      }
      taskController.cancel(state, reason);
      agents.delete(agentId);
      navigation?.release(agentId);
      trace.push({
        kind: "lifecycle",
        label: "ai.agent_unbound",
        timestamp: elapsed,
        agentId,
        payload: { reason }
      });
    },
    hasAgent(agentId) {
      return agents.has(agentId);
    },
    observe(agentId, facts) {
      const state = requireAgent(agentId);
      retainAiPerceptionFacts(state.memory, facts, state.definition.memoryLimit);
    },
    setBlackboard(agentId, key, value) {
      requireAgent(agentId).blackboard.set(key, value);
    },
    deleteBlackboard(agentId, key) {
      requireAgent(agentId).blackboard.delete(key);
    },
    setSchedulerClass(agentId, schedulerClassId) {
      const state = requireAgent(agentId);
      const schedulerClass = schedulerClasses.get(schedulerClassId);
      if (schedulerClass === undefined) {
        throw createAiError(
          "ai.definition_missing",
          `AI scheduler class is not registered: ${schedulerClassId}`,
          { agentId, schedulerClassId }
        );
      }
      const previousSchedulerClassId = state.schedulerClass.id;
      if (previousSchedulerClassId === schedulerClass.id) {
        return;
      }
      reclassifyAiAgent(state, schedulerClass, elapsed);
      trace.push({
        kind: "lifecycle",
        label: "ai.scheduler_class_changed",
        timestamp: elapsed,
        agentId,
        payload: {
          previousSchedulerClassId,
          schedulerClassId: schedulerClass.id,
          nextDecisionAt: state.nextDecisionAt
        }
      });
    },
    getAgent(agentId) {
      const state = agents.get(agentId);
      return state === undefined ? undefined : projectAiAgentSnapshot(state);
    },
    listAgents() {
      return sortedAgents().map(projectAiAgentSnapshot);
    },
    scoreGoals(agentId) {
      return goalController.score(requireAgent(agentId));
    },
    update(deltaMs, elapsedMs) {
      if (disposed) {
        return;
      }
      const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
      elapsed = Number.isFinite(elapsedMs) ? Math.max(elapsed, elapsedMs) : elapsed + delta;
      trace.beginUpdate();
      navigation?.beginUpdate();
      try {
        const ordered = sortedAgents();
        for (const state of ordered) {
          pruneAiPerceptionMemory(state.memory, elapsed);
          pruneAiGoalCooldowns(state.cooldowns, elapsed);
        }
        delayedSensorSamples += perceptionController.sample(ordered);
        delayedDecisions += decisionScheduler.run(ordered);
        updateTasks(ordered, delta);
      } finally {
        navigation?.endUpdate();
        trace.endUpdate(elapsed);
      }
    },
    captureCheckpoint() {
      return {
        version: 1,
        elapsed,
        agents: sortedAgents().map(projectAiAgentCheckpoint)
      };
    },
    restoreCheckpoint(checkpoint, restoreOptions) {
      requireActive();
      validateAiRuntimeCheckpoint(checkpoint);
      const restoredStates: AiAgentState[] = [];
      for (const saved of [...checkpoint.agents].sort((left, right) =>
        left.binding.agentId.localeCompare(right.binding.agentId)
      )) {
        const binding = restoreAiAgentBinding(saved.binding, restoreOptions);
        if (binding === undefined) {
          continue;
        }
        const compiled = definitionCompiler.compile(binding.definitionId);
        const restored = restoreAiTaskState(saved, binding, checkpoint.elapsed, restoreOptions);
        const schedulerClassId = restored.schedulerClassId ?? compiled.schedulerClass.id;
        const schedulerClass = schedulerClasses.get(schedulerClassId);
        if (schedulerClass === undefined) {
          throw createAiError(
            "ai.definition_missing",
            `AI scheduler class is not registered: ${schedulerClassId}`,
            { agentId: binding.agentId, schedulerClassId }
          );
        }
        const state = createAiAgentState({
          binding,
          compiled,
          elapsed: checkpoint.elapsed,
          blackboardLimit: resolvePositiveAiInteger(
            compiled.definition.blackboardLimit,
            limits.defaultBlackboardLimit
          ),
          blackboardValueLimits: limits.blackboardValueLimits
        });
        state.schedulerClass = schedulerClass;
        validateAiCheckpointCompatibility(state, restored);
        restoreAiAgentCheckpoint(state, restored);
        restoredStates.push(state);
      }
      for (const state of agents.values()) {
        taskController.cancel(state, "checkpoint-restore");
      }
      agents.clear();
      navigation?.clear();
      elapsed = checkpoint.elapsed;
      for (const state of restoredStates) {
        agents.set(state.binding.agentId, state);
        trace.push({
          kind: "lifecycle",
          label: "ai.agent_bound",
          timestamp: elapsed,
          agentId: state.binding.agentId,
          payload: { definitionId: state.binding.definitionId, restored: true }
        });
      }
      trace.push({
        kind: "lifecycle",
        label: "ai.checkpoint_restored",
        timestamp: elapsed,
        payload: { agents: agents.size }
      });
    },
    snapshot() {
      return projectAiRuntimeSnapshot({
        id,
        elapsed,
        disposed,
        compiledDefinitions: definitionCompiler.size(),
        agents: sortedAgents(),
        intentsEmitted,
        delayedSensorSamples,
        delayedDecisions,
        rejectedPathRequests: navigation?.rejectedRequests() ?? 0,
        droppedTraceEntries: trace.dropped(),
        traceEntries: traceStore.size()
      });
    },
    traces() {
      return traceStore.snapshot();
    },
    dispose() {
      if (disposed) {
        return;
      }
      for (const state of agents.values()) {
        taskController.cancel(state, "runtime-disposed");
      }
      agents.clear();
      navigation?.clear();
      definitionCompiler.clear();
      disposed = true;
      traceStore.clear();
    }
  };

  return runtime;

  function updateTasks(ordered: AiAgentState[], deltaMs: number): void {
    for (const state of ordered) {
      taskController.update(state, deltaMs);
    }
  }

  function recordTaskTransition(state: AiAgentState, transition: AiTaskTransition): void {
    if (transition.status === "started") {
      trace.push({
        kind: "task",
        label: "ai.task_started",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: { taskId: transition.taskId, executorId: transition.executorId }
      });
      return;
    }
    trace.push({
      kind: "task",
      label: `ai.task_${transition.status}`,
      timestamp: elapsed,
      agentId: state.binding.agentId,
      payload: {
        taskId: transition.taskId,
        goalId: transition.goalId ?? null,
        reason: transition.reason ?? null
      }
    });
    options.eventBus?.emit(
      "ai.task_transition",
      {
        agentId: state.binding.agentId,
        taskId: transition.taskId,
        status: transition.status,
        reason: transition.reason
      },
      id
    );
  }

  function requireAgent(agentId: string): AiAgentState {
    const state = agents.get(agentId);
    if (state === undefined) {
      throw createAiError("ai.agent_missing", `AI agent is not bound: ${agentId}`, { agentId });
    }
    return state;
  }

  function goalFor(state: AiAgentState, goalId: string): AiGoalDefinition {
    const goal = state.goalsById.get(goalId);
    if (goal === undefined) {
      throw createAiError("ai.definition_missing", `AI goal is missing: ${goalId}`);
    }
    return goal;
  }

  function taskFor(state: AiAgentState, taskId: string): AiTaskDefinition {
    const task = state.tasksById.get(taskId);
    if (task === undefined) {
      throw createAiError("ai.definition_missing", `AI task is missing: ${taskId}`);
    }
    return task;
  }

  function sortedAgents(): AiAgentState[] {
    return [...agents.values()].sort((left, right) => {
      const leftPriority = left.schedulerClass.priority ?? 0;
      const rightPriority = right.schedulerClass.priority ?? 0;
      return leftPriority === rightPriority
        ? left.binding.agentId.localeCompare(right.binding.agentId)
        : rightPriority - leftPriority;
    });
  }

  function projectGoalScores(scores: readonly AiGoalScore[]): Record<string, unknown> {
    const winner = scores.find((score) => score.eligible);
    const detail = limits.traceProduction.goalScoreDetail;
    const detailedScores =
      detail === "all" ? scores : detail === "winner" && winner !== undefined ? [winner] : [];
    return {
      candidates: scores.length,
      winner: winner?.goalId ?? null,
      ...(detailedScores.length === 0
        ? {}
        : {
            scores: detailedScores.map((score) => ({
              goalId: score.goalId,
              score: score.score,
              eligible: score.eligible,
              considerations: score.considerations.map((consideration) => ({ ...consideration }))
            }))
          })
    };
  }

  function requireActive(): void {
    if (disposed) {
      throw createAiError("ai.invalid_config", "AI runtime is disposed");
    }
  }
}
