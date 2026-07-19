import { AI_AGENT_TYPE, AI_GOAL_TYPE, AI_SENSOR_TYPE, AI_TASK_TYPE } from "../data";
import { createAiError } from "./errors";
import { createAiTraceStore } from "./trace-store";
import type {
  AiAgentBinding,
  AiAgentCheckpoint,
  AiAgentDefinition,
  AiAgentReadContext,
  AiAgentSnapshot,
  AiGoalDefinition,
  AiGoalScore,
  AiIntentInput,
  AiPerceptionFact,
  AiRestoreOptions,
  AiRuntime,
  AiSchedulerClass,
  AiSensorDefinition,
  AiTaskContext,
  AiTaskDefinition,
  AiTaskState,
  AiTaskStep,
  AiUtilityCurve,
  CreateAiRuntimeOptions
} from "./types";

type AgentState = {
  binding: AiAgentBinding;
  definition: AiAgentDefinition;
  sensors: AiSensorDefinition[];
  goals: AiGoalDefinition[];
  goalsById: Map<string, AiGoalDefinition>;
  tasksById: Map<string, AiTaskDefinition>;
  schedulerClass: AiSchedulerClass;
  memory: Map<string, AiPerceptionFact>;
  blackboard: Map<string, unknown>;
  currentGoalId: string | undefined;
  currentGoalScore: number | undefined;
  committedUntil: number | undefined;
  task: AiTaskState | undefined;
  cooldowns: Map<string, number>;
  nextDecisionAt: number;
  nextSensorAt: Map<string, number>;
  delayedDecisions: number;
};

type RuntimeLimits = {
  maxSensorSamplesPerTick: number;
  maxDecisionsPerTick: number;
  failureBackoffMs: number;
};

type CompiledAgentDefinition = Pick<
  AgentState,
  "definition" | "sensors" | "goals" | "goalsById" | "tasksById" | "schedulerClass"
>;

export function createAiRuntime(options: CreateAiRuntimeOptions): AiRuntime {
  const id = options.id ?? "ai";
  const limits: RuntimeLimits = {
    maxSensorSamplesPerTick: positiveInteger(options.maxSensorSamplesPerTick, 256),
    maxDecisionsPerTick: positiveInteger(options.maxDecisionsPerTick, 128),
    failureBackoffMs: nonNegative(options.failureBackoffMs, 100)
  };
  const sensorRegistry = registry(options.sensors ?? [], "sensor");
  const inputRegistry = registry(options.inputs ?? [], "input");
  const taskRegistry = registry(options.tasks ?? [], "task");
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
  const trace = createAiTraceStore({
    limit: nonNegativeInteger(options.traceLimit, 512),
    onEntry: options.onTrace,
    onEntryError: options.onTraceError
  });
  const compiledDefinitions = new Map<string, CompiledAgentDefinition>();
  const agents = new Map<string, AgentState>();
  let elapsed = 0;
  let disposed = false;
  let intentsEmitted = 0;
  let delayedSensorSamples = 0;
  let delayedDecisions = 0;

  trace.push({ kind: "lifecycle", label: "ai.created", timestamp: elapsed });

  const runtime: AiRuntime = {
    bind(binding) {
      requireActive();
      if (!binding.agentId || agents.has(binding.agentId)) {
        throw createAiError("ai.agent_bound", `AI agent is already bound: ${binding.agentId}`, {
          agentId: binding.agentId
        });
      }
      const compiled = compileAgentDefinition(binding.definitionId);
      const definition = compiled.definition;
      const schedulerClass = compiled.schedulerClass;
      const decisionInterval = effectiveInterval(
        definition.decisionIntervalMs,
        schedulerClass.decisionIntervalMultiplier
      );
      const state: AgentState = {
        binding: cloneBinding(binding),
        definition,
        sensors: compiled.sensors,
        goals: compiled.goals,
        goalsById: compiled.goalsById,
        tasksById: compiled.tasksById,
        schedulerClass,
        memory: new Map(),
        blackboard: new Map(),
        currentGoalId: undefined,
        currentGoalScore: undefined,
        committedUntil: undefined,
        task: undefined,
        cooldowns: new Map(),
        nextDecisionAt: elapsed + stableOffset(binding.agentId, decisionInterval),
        nextSensorAt: new Map(),
        delayedDecisions: 0
      };
      for (const sensor of compiled.sensors) {
        const interval = effectiveInterval(
          sensor.intervalMs,
          schedulerClass.sensorIntervalMultiplier
        );
        state.nextSensorAt.set(
          sensor.id,
          elapsed + stableOffset(`${binding.agentId}:${sensor.id}`, interval)
        );
      }
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
      cancelTask(state, reason);
      agents.delete(agentId);
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
      retainFacts(state, facts);
    },
    setBlackboard(agentId, key, value) {
      requireAgent(agentId).blackboard.set(key, cloneValue(value));
    },
    deleteBlackboard(agentId, key) {
      requireAgent(agentId).blackboard.delete(key);
    },
    getAgent(agentId) {
      const state = agents.get(agentId);
      return state === undefined ? undefined : agentSnapshot(state);
    },
    listAgents() {
      return sortedAgents().map(agentSnapshot);
    },
    scoreGoals(agentId) {
      return scoreAgentGoals(requireAgent(agentId));
    },
    update(deltaMs, elapsedMs) {
      if (disposed) {
        return;
      }
      const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
      elapsed = Number.isFinite(elapsedMs) ? Math.max(elapsed, elapsedMs) : elapsed + delta;
      const ordered = sortedAgents();
      for (const state of ordered) {
        pruneMemory(state);
      }
      sampleSensors(ordered);
      decide(ordered);
      updateTasks(ordered, delta);
    },
    captureCheckpoint() {
      return {
        version: 1,
        elapsed,
        agents: sortedAgents().map(agentCheckpoint)
      };
    },
    restoreCheckpoint(checkpoint, restoreOptions) {
      requireActive();
      if (
        checkpoint.version !== 1 ||
        !Number.isFinite(checkpoint.elapsed) ||
        checkpoint.elapsed < 0
      ) {
        throw createAiError("ai.invalid_config", "AI checkpoint is invalid");
      }
      for (const state of agents.values()) {
        cancelTask(state, "checkpoint-restore");
      }
      agents.clear();
      elapsed = checkpoint.elapsed;
      for (const saved of [...checkpoint.agents].sort((left, right) =>
        left.binding.agentId.localeCompare(right.binding.agentId)
      )) {
        const binding = restoreBinding(saved.binding, restoreOptions);
        if (binding === undefined) {
          continue;
        }
        runtime.bind(binding);
        const state = requireAgent(binding.agentId);
        state.memory.clear();
        retainFacts(state, saved.memory);
        state.blackboard = new Map(
          Object.entries(saved.blackboard).map(([key, value]) => [key, cloneValue(value)])
        );
        state.currentGoalId = saved.currentGoalId;
        state.currentGoalScore = saved.currentGoalScore;
        state.committedUntil = saved.committedUntil;
        state.task = saved.task === undefined ? undefined : cloneTaskState(saved.task);
        state.cooldowns = new Map(saved.cooldowns);
        state.nextDecisionAt = saved.nextDecisionAt;
        state.nextSensorAt = new Map(saved.nextSensorAt);
        state.delayedDecisions = saved.delayedDecisions;
      }
      trace.push({
        kind: "lifecycle",
        label: "ai.checkpoint_restored",
        timestamp: elapsed,
        payload: { agents: agents.size }
      });
    },
    snapshot() {
      const agentSnapshots = sortedAgents().map(agentSnapshot);
      return {
        id,
        elapsed,
        disposed,
        compiledDefinitions: compiledDefinitions.size,
        agents: agentSnapshots,
        activeTasks: agentSnapshots.filter((agent) => agent.task?.status === "running").length,
        memoryFacts: agentSnapshots.reduce((total, agent) => total + agent.memorySize, 0),
        intentsEmitted,
        delayedSensorSamples,
        delayedDecisions,
        traceEntries: trace.size()
      };
    },
    traces() {
      return trace.snapshot();
    },
    dispose() {
      if (disposed) {
        return;
      }
      for (const state of agents.values()) {
        cancelTask(state, "runtime-disposed");
      }
      agents.clear();
      compiledDefinitions.clear();
      disposed = true;
      trace.clear();
    }
  };

  return runtime;

  function sampleSensors(ordered: AgentState[]): void {
    const due = ordered.flatMap((state) =>
      state.sensors.flatMap((sensor) => {
        const dueAt = state.nextSensorAt.get(sensor.id) ?? elapsed;
        return dueAt <= elapsed ? [{ state, sensor, dueAt }] : [];
      })
    );
    due.sort((left, right) =>
      left.dueAt === right.dueAt
        ? left.state.binding.agentId === right.state.binding.agentId
          ? left.sensor.id.localeCompare(right.sensor.id)
          : left.state.binding.agentId.localeCompare(right.state.binding.agentId)
        : left.dueAt - right.dueAt
    );
    let samples = 0;
    for (const { state, sensor } of due) {
      if (samples >= limits.maxSensorSamplesPerTick) {
        delayedSensorSamples += 1;
        trace.push({
          kind: "budget",
          label: "ai.sensor_delayed",
          timestamp: elapsed,
          agentId: state.binding.agentId,
          payload: { sensorId: sensor.id }
        });
        continue;
      }
      const sampler = sensorRegistry.get(sensor.sampler);
      if (sampler === undefined) {
        continue;
      }
      const facts = sampler.sample(readContext(state), sensor);
      retainFacts(state, facts);
      const schedulerClass = state.schedulerClass;
      const interval = effectiveInterval(
        sensor.intervalMs,
        schedulerClass.sensorIntervalMultiplier
      );
      state.nextSensorAt.set(sensor.id, elapsed + interval);
      samples += 1;
      trace.push({
        kind: "perception",
        label: "ai.sensor_sampled",
        timestamp: elapsed,
        agentId: state.binding.agentId,
        payload: { sensorId: sensor.id, facts: facts.length }
      });
    }
  }

  function decide(ordered: AgentState[]): void {
    const due = ordered
      .filter((state) => state.nextDecisionAt <= elapsed)
      .sort((left, right) =>
        left.nextDecisionAt === right.nextDecisionAt
          ? left.binding.agentId.localeCompare(right.binding.agentId)
          : left.nextDecisionAt - right.nextDecisionAt
      );
    let decisions = 0;
    for (const state of due) {
      if (decisions >= limits.maxDecisionsPerTick) {
        state.delayedDecisions += 1;
        delayedDecisions += 1;
        trace.push({
          kind: "budget",
          label: "ai.decision_delayed",
          timestamp: elapsed,
          agentId: state.binding.agentId
        });
        continue;
      }
      const scores = scoreAgentGoals(state);
      chooseGoal(state, scores);
      const schedulerClass = state.schedulerClass;
      state.nextDecisionAt =
        elapsed +
        effectiveInterval(
          state.definition.decisionIntervalMs,
          schedulerClass.decisionIntervalMultiplier
        );
      decisions += 1;
    }
  }

  function updateTasks(ordered: AgentState[], deltaMs: number): void {
    for (const state of ordered) {
      const taskState = state.task;
      if (
        taskState === undefined ||
        taskState.status !== "running" ||
        taskState.updatedAt === elapsed
      ) {
        continue;
      }
      const task = taskFor(state, taskState.taskId);
      if (task.timeoutMs !== undefined && elapsed - taskState.startedAt >= task.timeoutMs) {
        finishTask(state, { status: "failed", reason: "timeout", state: taskState.state });
        continue;
      }
      const executor = taskRegistry.get(task.executor);
      if (executor === undefined || state.currentGoalId === undefined) {
        finishTask(state, { status: "failed", reason: "executor-missing", state: taskState.state });
        continue;
      }
      const goal = goalFor(state, state.currentGoalId);
      const step = executor.update(taskContext(state, goal, task, taskState), deltaMs);
      applyTaskStep(state, step);
    }
  }

  function scoreAgentGoals(state: AgentState): AiGoalScore[] {
    const context = readContext(state);
    const scores = state.goals.map((goal) => {
      const considerations = goal.considerations.map((consideration) => {
        const resolver = inputRegistry.get(consideration.input);
        const raw = resolver?.read(context, consideration) ?? 0;
        return {
          input: consideration.input,
          raw,
          curved: evaluateCurve(consideration.curve, raw),
          weight: consideration.weight ?? 1
        };
      });
      const totalWeight = considerations.reduce((total, item) => total + item.weight, 0);
      const utility = considerations.some((item) => item.curved <= 0)
        ? 0
        : Math.exp(
            considerations.reduce(
              (total, item) => total + Math.log(clamp01(item.curved)) * item.weight,
              0
            ) / Math.max(totalWeight, 1)
          );
      const score = clamp01(utility * (goal.weight ?? 1));
      const cooldownUntil = state.cooldowns.get(goal.id) ?? 0;
      return {
        goalId: goal.id,
        score,
        eligible: score >= (goal.minScore ?? 0) && cooldownUntil <= elapsed,
        considerations
      };
    });
    scores.sort((left, right) =>
      left.score === right.score
        ? left.goalId.localeCompare(right.goalId)
        : right.score - left.score
    );
    trace.push({
      kind: "decision",
      label: "ai.goals_scored",
      timestamp: elapsed,
      agentId: state.binding.agentId,
      payload: {
        candidates: scores.length,
        winner: scores.find((score) => score.eligible)?.goalId ?? null
      }
    });
    return scores;
  }

  function chooseGoal(state: AgentState, scores: AiGoalScore[]): void {
    const candidate = scores.find((score) => score.eligible);
    const current =
      state.currentGoalId === undefined
        ? undefined
        : scores.find((score) => score.goalId === state.currentGoalId);
    if (
      state.currentGoalId !== undefined &&
      (state.committedUntil ?? 0) > elapsed &&
      current?.eligible
    ) {
      state.currentGoalScore = current.score;
      return;
    }
    if (candidate === undefined) {
      if (state.currentGoalId !== undefined) {
        cancelTask(state, "no-eligible-goal");
        state.currentGoalId = undefined;
        state.currentGoalScore = undefined;
        state.committedUntil = undefined;
      }
      return;
    }
    if (candidate.goalId === state.currentGoalId) {
      state.currentGoalScore = candidate.score;
      return;
    }
    if (state.currentGoalId !== undefined && current !== undefined) {
      const currentGoal = goalFor(state, state.currentGoalId);
      const threshold = currentGoal.switchThreshold ?? 0;
      if (candidate.score < current.score + threshold || !canInterrupt(state)) {
        state.currentGoalScore = current.score;
        return;
      }
      cancelTask(state, "goal-switched");
      if ((currentGoal.cooldownMs ?? 0) > 0) {
        state.cooldowns.set(currentGoal.id, elapsed + (currentGoal.cooldownMs ?? 0));
      }
    }
    const goal = goalFor(state, candidate.goalId);
    state.currentGoalId = goal.id;
    state.currentGoalScore = candidate.score;
    state.committedUntil = elapsed + (goal.commitmentMs ?? 0);
    trace.push({
      kind: "goal",
      label: "ai.goal_selected",
      timestamp: elapsed,
      agentId: state.binding.agentId,
      payload: { goalId: goal.id, score: candidate.score }
    });
    options.eventBus?.emit(
      "ai.goal_selected",
      { agentId: state.binding.agentId, goalId: goal.id, score: candidate.score },
      id
    );
    startTask(state, goal);
  }

  function startTask(state: AgentState, goal: AiGoalDefinition): void {
    const task = taskFor(state, goal.task.id);
    const executor = taskRegistry.get(task.executor);
    if (executor === undefined) {
      finishTask(state, { status: "failed", reason: "executor-missing" });
      return;
    }
    const taskState: AiTaskState = {
      taskId: task.id,
      executorId: executor.id,
      status: "starting",
      startedAt: elapsed,
      updatedAt: elapsed,
      safeToInterrupt: task.interruptPolicy === "always",
      state: {}
    };
    state.task = taskState;
    trace.push({
      kind: "task",
      label: "ai.task_started",
      timestamp: elapsed,
      agentId: state.binding.agentId,
      payload: { taskId: task.id, executorId: executor.id }
    });
    const step = executor.start(taskContext(state, goal, task, taskState));
    applyTaskStep(state, step);
  }

  function applyTaskStep(state: AgentState, step: AiTaskStep): void {
    const taskState = state.task;
    if (taskState === undefined) {
      return;
    }
    taskState.updatedAt = elapsed;
    taskState.state = cloneRecord(step.state ?? taskState.state);
    taskState.safeToInterrupt = step.safeToInterrupt ?? taskState.safeToInterrupt;
    if (step.status === "running") {
      taskState.status = "running";
      return;
    }
    finishTask(state, step);
  }

  function finishTask(state: AgentState, step: AiTaskStep): void {
    const taskState = state.task;
    if (taskState !== undefined) {
      taskState.status = step.status;
      taskState.updatedAt = elapsed;
      taskState.state = cloneRecord(step.state ?? taskState.state);
      if (step.reason === undefined) {
        delete taskState.failureReason;
      } else {
        taskState.failureReason = step.reason;
      }
    }
    const goalId = state.currentGoalId;
    trace.push({
      kind: "task",
      label: `ai.task_${step.status}`,
      timestamp: elapsed,
      agentId: state.binding.agentId,
      payload: {
        taskId: taskState?.taskId ?? null,
        goalId: goalId ?? null,
        reason: step.reason ?? null
      }
    });
    options.eventBus?.emit(
      "ai.task_transition",
      {
        agentId: state.binding.agentId,
        taskId: taskState?.taskId,
        status: step.status,
        reason: step.reason
      },
      id
    );
    if (goalId !== undefined) {
      const goal = goalFor(state, goalId);
      if ((goal.cooldownMs ?? 0) > 0) {
        state.cooldowns.set(goalId, elapsed + (goal.cooldownMs ?? 0));
      }
    }
    state.task = undefined;
    state.currentGoalId = undefined;
    state.currentGoalScore = undefined;
    state.committedUntil = undefined;
    state.nextDecisionAt =
      elapsed +
      (step.status === "failed" ? limits.failureBackoffMs : state.definition.decisionIntervalMs);
  }

  function cancelTask(state: AgentState, reason: string): void {
    const taskState = state.task;
    if (taskState === undefined) {
      return;
    }
    const task = taskFor(state, taskState.taskId);
    const goal =
      state.currentGoalId === undefined ? undefined : goalFor(state, state.currentGoalId);
    const executor = taskRegistry.get(task.executor);
    if (goal !== undefined) {
      executor?.cancel?.(taskContext(state, goal, task, taskState), reason);
    }
    taskState.status = "cancelled";
    taskState.failureReason = reason;
    trace.push({
      kind: "task",
      label: "ai.task_cancelled",
      timestamp: elapsed,
      agentId: state.binding.agentId,
      payload: { taskId: task.id, reason }
    });
    state.task = undefined;
  }

  function canInterrupt(state: AgentState): boolean {
    const taskState = state.task;
    if (taskState === undefined) {
      return true;
    }
    const task = taskFor(state, taskState.taskId);
    switch (task.interruptPolicy ?? "always") {
      case "always":
        return true;
      case "safe-point":
        return taskState.safeToInterrupt;
      case "never":
        return false;
    }
  }

  function readContext(state: AgentState): AiAgentReadContext {
    return {
      elapsed,
      agent: cloneBinding(state.binding),
      definition: cloneAgentDefinition(state.definition),
      world: options.world,
      ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
      facts: () => sortedFacts(state),
      fact: (key, subjectId) => {
        const fact = state.memory.get(factKey(key, subjectId));
        return fact === undefined ? undefined : cloneFact(fact);
      },
      blackboard: <T>(key: string) => cloneValue(state.blackboard.get(key)) as T | undefined
    };
  }

  function taskContext(
    state: AgentState,
    goal: AiGoalDefinition,
    task: AiTaskDefinition,
    taskState: AiTaskState
  ): AiTaskContext {
    return {
      ...readContext(state),
      goal: cloneGoal(goal),
      task: cloneTask(task),
      state: cloneRecord(taskState.state),
      emit(intent: AiIntentInput) {
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
      },
      setBlackboard(key, value) {
        state.blackboard.set(key, cloneValue(value));
      },
      deleteBlackboard(key) {
        state.blackboard.delete(key);
      }
    };
  }

  function retainFacts(state: AgentState, facts: AiPerceptionFact[]): void {
    for (const input of facts) {
      if (!input.key || !Number.isFinite(input.observedAt)) {
        continue;
      }
      const fact = cloneFact(input);
      state.memory.delete(factKey(fact.key, fact.subjectId));
      state.memory.set(factKey(fact.key, fact.subjectId), fact);
    }
    while (state.memory.size > state.definition.memoryLimit) {
      let oldestKey: string | undefined;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, fact] of state.memory) {
        if (
          fact.observedAt < oldestAt ||
          (fact.observedAt === oldestAt && (oldestKey === undefined || key < oldestKey))
        ) {
          oldestKey = key;
          oldestAt = fact.observedAt;
        }
      }
      if (oldestKey === undefined) {
        break;
      }
      state.memory.delete(oldestKey);
    }
  }

  function pruneMemory(state: AgentState): void {
    for (const [key, fact] of state.memory) {
      if (fact.expiresAt !== undefined && fact.expiresAt <= elapsed) {
        state.memory.delete(key);
      }
    }
    for (const [goalId, cooldownUntil] of state.cooldowns) {
      if (cooldownUntil <= elapsed) {
        state.cooldowns.delete(goalId);
      }
    }
  }

  function sortedFacts(state: AgentState): AiPerceptionFact[] {
    return [...state.memory.values()]
      .sort((left, right) =>
        left.key === right.key
          ? (left.subjectId ?? "").localeCompare(right.subjectId ?? "")
          : left.key.localeCompare(right.key)
      )
      .map(cloneFact);
  }

  function compileAgentDefinition(definitionId: string): CompiledAgentDefinition {
    const existing = compiledDefinitions.get(definitionId);
    if (existing !== undefined) {
      return existing;
    }
    const definition = cloneAgentDefinition(
      definitionFor<AiAgentDefinition>(AI_AGENT_TYPE, definitionId)
    );
    const sensors = definition.sensors.map((sensorRef) =>
      cloneSensor(definitionFor<AiSensorDefinition>(AI_SENSOR_TYPE, sensorRef.id))
    );
    for (const sensor of sensors) {
      if (!sensorRegistry.has(sensor.sampler)) {
        throw createAiError(
          "ai.definition_missing",
          `AI sensor sampler is not registered: ${sensor.sampler}`
        );
      }
    }
    const goals = definition.goals.map((goalRef) =>
      cloneGoal(definitionFor<AiGoalDefinition>(AI_GOAL_TYPE, goalRef.id))
    );
    const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
    if (goalsById.size !== goals.length) {
      throw createAiError(
        "ai.duplicate_registry_entry",
        `AI agent contains duplicate goals: ${definition.id}`
      );
    }
    const tasksById = new Map<string, AiTaskDefinition>();
    for (const goal of goals) {
      for (const consideration of goal.considerations) {
        if (!inputRegistry.has(consideration.input)) {
          throw createAiError(
            "ai.definition_missing",
            `AI utility input is not registered: ${consideration.input}`
          );
        }
      }
      let task = tasksById.get(goal.task.id);
      if (task === undefined) {
        task = cloneTask(definitionFor<AiTaskDefinition>(AI_TASK_TYPE, goal.task.id));
        tasksById.set(task.id, task);
      }
      if (!taskRegistry.has(task.executor)) {
        throw createAiError(
          "ai.definition_missing",
          `AI task executor is not registered: ${task.executor}`
        );
      }
    }
    const compiled: CompiledAgentDefinition = {
      definition,
      sensors,
      goals,
      goalsById,
      tasksById,
      schedulerClass: schedulerClassFor(definition)
    };
    compiledDefinitions.set(definitionId, compiled);
    return compiled;
  }

  function definitionFor<T>(type: string, definitionId: string): T {
    if (!options.dataRegistry.has(type, definitionId)) {
      throw createAiError(
        "ai.definition_missing",
        `AI definition is missing: ${type}/${definitionId}`
      );
    }
    return options.dataRegistry.getValue<T>(type, definitionId);
  }

  function schedulerClassFor(definition: AiAgentDefinition): AiSchedulerClass {
    return (
      schedulerClasses.get(definition.schedulerClass ?? "default") ??
      (schedulerClasses.get("default") as AiSchedulerClass)
    );
  }

  function requireAgent(agentId: string): AgentState {
    const state = agents.get(agentId);
    if (state === undefined) {
      throw createAiError("ai.agent_missing", `AI agent is not bound: ${agentId}`, { agentId });
    }
    return state;
  }

  function goalFor(state: AgentState, goalId: string): AiGoalDefinition {
    const goal = state.goalsById.get(goalId);
    if (goal === undefined) {
      throw createAiError("ai.definition_missing", `AI goal is missing: ${goalId}`);
    }
    return goal;
  }

  function taskFor(state: AgentState, taskId: string): AiTaskDefinition {
    const task = state.tasksById.get(taskId);
    if (task === undefined) {
      throw createAiError("ai.definition_missing", `AI task is missing: ${taskId}`);
    }
    return task;
  }

  function sortedAgents(): AgentState[] {
    return [...agents.values()].sort((left, right) => {
      const leftPriority = left.schedulerClass.priority ?? 0;
      const rightPriority = right.schedulerClass.priority ?? 0;
      return leftPriority === rightPriority
        ? left.binding.agentId.localeCompare(right.binding.agentId)
        : rightPriority - leftPriority;
    });
  }

  function agentSnapshot(state: AgentState): AiAgentSnapshot {
    return {
      binding: cloneBinding(state.binding),
      ...(state.currentGoalId === undefined ? {} : { goalId: state.currentGoalId }),
      ...(state.currentGoalScore === undefined ? {} : { goalScore: state.currentGoalScore }),
      ...(state.committedUntil === undefined ? {} : { committedUntil: state.committedUntil }),
      ...(state.task === undefined ? {} : { task: cloneTaskState(state.task) }),
      memorySize: state.memory.size,
      blackboardKeys: [...state.blackboard.keys()].sort(),
      nextDecisionAt: state.nextDecisionAt,
      delayedDecisions: state.delayedDecisions
    };
  }

  function agentCheckpoint(state: AgentState): AiAgentCheckpoint {
    return {
      binding: cloneBinding(state.binding),
      memory: sortedFacts(state),
      blackboard: Object.fromEntries(
        [...state.blackboard.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, cloneValue(value)])
      ),
      ...(state.currentGoalId === undefined ? {} : { currentGoalId: state.currentGoalId }),
      ...(state.currentGoalScore === undefined ? {} : { currentGoalScore: state.currentGoalScore }),
      ...(state.committedUntil === undefined ? {} : { committedUntil: state.committedUntil }),
      ...(state.task === undefined ? {} : { task: cloneTaskState(state.task) }),
      cooldowns: [...state.cooldowns.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      ),
      nextDecisionAt: state.nextDecisionAt,
      nextSensorAt: [...state.nextSensorAt.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      ),
      delayedDecisions: state.delayedDecisions
    };
  }

  function requireActive(): void {
    if (disposed) {
      throw createAiError("ai.invalid_config", "AI runtime is disposed");
    }
  }
}

export function evaluateAiUtilityCurve(curve: AiUtilityCurve, raw: number): number {
  return evaluateCurve(curve, raw);
}

function evaluateCurve(curve: AiUtilityCurve, raw: number): number {
  if (!Number.isFinite(raw)) {
    return 0;
  }
  switch (curve.type) {
    case "linear":
      return normalize(raw, curve.min ?? 0, curve.max ?? 1);
    case "inverse":
      return 1 - normalize(raw, curve.min ?? 0, curve.max ?? 1);
    case "step":
      return clamp01(raw >= curve.threshold ? (curve.above ?? 1) : (curve.below ?? 0));
    case "power":
      return Math.pow(normalize(raw, curve.min ?? 0, curve.max ?? 1), curve.exponent);
    case "points":
      return evaluatePointsCurve(curve.points, raw);
  }
}

function evaluatePointsCurve(points: Array<{ x: number; y: number }>, raw: number): number {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (raw <= first.x) {
    return clamp01(first.y);
  }
  if (raw >= last.x) {
    return clamp01(last.y);
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left !== undefined && right !== undefined && raw >= left.x && raw <= right.x) {
      const amount = (raw - left.x) / (right.x - left.x);
      return clamp01(left.y + (right.y - left.y) * amount);
    }
  }
  return 0;
}

function normalize(value: number, min: number, max: number): number {
  return max === min ? (value >= max ? 1 : 0) : clamp01((value - min) / (max - min));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function registry<T extends { id: string }>(values: T[], category: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (!value.id || result.has(value.id)) {
      throw createAiError(
        "ai.duplicate_registry_entry",
        `Duplicate AI ${category} registry entry: ${value.id}`
      );
    }
    result.set(value.id, value);
  }
  return result;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw createAiError("ai.invalid_config", "AI limit must be a positive integer", {
      value: resolved
    });
  }
  return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createAiError("ai.invalid_config", "AI limit must be a non-negative integer", {
      value: resolved
    });
  }
  return resolved;
}

function nonNegative(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw createAiError("ai.invalid_config", "AI duration must be non-negative", {
      value: resolved
    });
  }
  return resolved;
}

function effectiveInterval(base: number, multiplier: number | undefined): number {
  return Math.max(1, base * (multiplier ?? 1));
}

function stableOffset(key: string, interval: number): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, Math.floor(interval));
}

function factKey(key: string, subjectId: string | undefined): string {
  return `${key}\u0000${subjectId ?? ""}`;
}

function cloneBinding(binding: AiAgentBinding): AiAgentBinding {
  return { ...binding };
}

function cloneFact(fact: AiPerceptionFact): AiPerceptionFact {
  return {
    ...fact,
    ...(fact.position === undefined ? {} : { position: { ...fact.position } }),
    ...(fact.metadata === undefined ? {} : { metadata: cloneRecord(fact.metadata) })
  };
}

function cloneTaskState(task: AiTaskState): AiTaskState {
  return { ...task, state: cloneRecord(task.state) };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneValue(item)])
    ) as T;
  }
  return value;
}

function cloneAgentDefinition(definition: AiAgentDefinition): AiAgentDefinition {
  return {
    ...definition,
    sensors: definition.sensors.map((reference) => ({ ...reference })),
    goals: definition.goals.map((reference) => ({ ...reference })),
    ...(definition.tags === undefined ? {} : { tags: [...definition.tags] })
  };
}

function cloneSensor(sensor: AiSensorDefinition): AiSensorDefinition {
  return {
    ...sensor,
    ...(sensor.args === undefined ? {} : { args: cloneRecord(sensor.args) }),
    ...(sensor.tags === undefined ? {} : { tags: [...sensor.tags] })
  };
}

function cloneGoal(goal: AiGoalDefinition): AiGoalDefinition {
  return {
    ...goal,
    task: { ...goal.task },
    considerations: goal.considerations.map((consideration) => ({
      ...consideration,
      curve:
        consideration.curve.type === "points"
          ? { type: "points", points: consideration.curve.points.map((point) => ({ ...point })) }
          : { ...consideration.curve }
    })),
    ...(goal.tags === undefined ? {} : { tags: [...goal.tags] })
  };
}

function cloneTask(task: AiTaskDefinition): AiTaskDefinition {
  return {
    ...task,
    ...(task.args === undefined ? {} : { args: cloneRecord(task.args) }),
    ...(task.tags === undefined ? {} : { tags: [...task.tags] })
  };
}

function restoreBinding(
  binding: AiAgentBinding,
  options: AiRestoreOptions | undefined
): AiAgentBinding | undefined {
  if (binding.entityId === undefined || options?.resolveEntityId === undefined) {
    return cloneBinding(binding);
  }
  const entityId = options.resolveEntityId(binding.entityId);
  return entityId === undefined ? undefined : { ...binding, entityId };
}
