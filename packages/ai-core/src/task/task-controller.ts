import type { AiAgentDefinition } from "../definition/agent-definition";
import type { AiGoalDefinition } from "../definition/goal-definition";
import type { AiTaskDefinition } from "../definition/task-definition";
import { cloneAiRecord } from "../contracts/clone-runtime-value";
import type { AiTaskContext, AiTaskExecutor, AiTaskState, AiTaskStep } from "./task-executor";

export type AiTaskControllerAgent = {
  definition: AiAgentDefinition;
  currentGoalId: string | undefined;
  currentGoalScore: number | undefined;
  committedUntil: number | undefined;
  task: AiTaskState | undefined;
  cooldowns: Map<string, number>;
  nextDecisionAt: number;
};

export type AiTaskTransition =
  | {
      status: "started";
      taskId: string;
      executorId: string;
      goalId: string;
    }
  | {
      status: "succeeded" | "failed" | "cancelled";
      taskId: string;
      goalId: string | undefined;
      reason: string | undefined;
    };

export type AiTaskController<TAgent extends AiTaskControllerAgent> = {
  update(agent: TAgent, deltaMs: number): void;
  start(agent: TAgent, goal: AiGoalDefinition): void;
  cancel(agent: TAgent, reason: string): void;
  canInterrupt(agent: TAgent): boolean;
};

export function createAiTaskController<TAgent extends AiTaskControllerAgent>(options: {
  elapsed(): number;
  failureBackoffMs: number;
  decisionInterval(agent: TAgent): number;
  taskFor(agent: TAgent, taskId: string): AiTaskDefinition;
  goalFor(agent: TAgent, goalId: string): AiGoalDefinition;
  executorFor(executorId: string): AiTaskExecutor | undefined;
  contextFor(
    agent: TAgent,
    goal: AiGoalDefinition,
    task: AiTaskDefinition,
    state: AiTaskState
  ): AiTaskContext;
  onTransition(agent: TAgent, transition: AiTaskTransition): void;
}): AiTaskController<TAgent> {
  return {
    update(agent, deltaMs) {
      const taskState = agent.task;
      const elapsed = options.elapsed();
      if (
        taskState === undefined ||
        taskState.status !== "running" ||
        taskState.updatedAt === elapsed
      ) {
        return;
      }
      const task = options.taskFor(agent, taskState.taskId);
      if (task.timeoutMs !== undefined && elapsed - taskState.startedAt >= task.timeoutMs) {
        finish(agent, { status: "failed", reason: "timeout", state: taskState.state });
        return;
      }
      const executor = options.executorFor(task.executor);
      if (executor === undefined || agent.currentGoalId === undefined) {
        finish(agent, {
          status: "failed",
          reason: "executor-missing",
          state: taskState.state
        });
        return;
      }
      const goal = options.goalFor(agent, agent.currentGoalId);
      applyStep(agent, executor.update(options.contextFor(agent, goal, task, taskState), deltaMs));
    },
    start(agent, goal) {
      const task = options.taskFor(agent, goal.task.id);
      const executor = options.executorFor(task.executor);
      const elapsed = options.elapsed();
      const taskState: AiTaskState = {
        taskId: task.id,
        executorId: task.executor,
        status: "starting",
        startedAt: elapsed,
        updatedAt: elapsed,
        safeToInterrupt: task.interruptPolicy === "always",
        state: {}
      };
      agent.task = taskState;
      if (executor === undefined) {
        finish(agent, { status: "failed", reason: "executor-missing" });
        return;
      }
      taskState.executorId = executor.id;
      options.onTransition(agent, {
        status: "started",
        taskId: task.id,
        executorId: executor.id,
        goalId: goal.id
      });
      applyStep(agent, executor.start(options.contextFor(agent, goal, task, taskState)));
    },
    cancel(agent, reason) {
      const taskState = agent.task;
      if (taskState === undefined) {
        return;
      }
      const task = options.taskFor(agent, taskState.taskId);
      const goal =
        agent.currentGoalId === undefined ? undefined : options.goalFor(agent, agent.currentGoalId);
      const executor = options.executorFor(task.executor);
      if (goal !== undefined) {
        executor?.cancel?.(options.contextFor(agent, goal, task, taskState), reason);
      }
      taskState.status = "cancelled";
      taskState.failureReason = reason;
      options.onTransition(agent, {
        status: "cancelled",
        taskId: task.id,
        goalId: agent.currentGoalId,
        reason
      });
      agent.task = undefined;
    },
    canInterrupt(agent) {
      const taskState = agent.task;
      if (taskState === undefined) {
        return true;
      }
      const task = options.taskFor(agent, taskState.taskId);
      switch (task.interruptPolicy ?? "always") {
        case "always":
          return true;
        case "safe-point":
          return taskState.safeToInterrupt;
        case "never":
          return false;
      }
    }
  };

  function applyStep(agent: TAgent, step: AiTaskStep): void {
    const taskState = agent.task;
    if (taskState === undefined) {
      return;
    }
    taskState.updatedAt = options.elapsed();
    taskState.state = cloneAiRecord(step.state ?? taskState.state);
    taskState.safeToInterrupt = step.safeToInterrupt ?? taskState.safeToInterrupt;
    if (step.status === "running") {
      taskState.status = "running";
      return;
    }
    finish(agent, { ...step, status: step.status });
  }

  function finish(agent: TAgent, step: AiTaskStep & { status: "succeeded" | "failed" }): void {
    const taskState = agent.task;
    const elapsed = options.elapsed();
    if (taskState !== undefined) {
      taskState.status = step.status;
      taskState.updatedAt = elapsed;
      taskState.state = cloneAiRecord(step.state ?? taskState.state);
      if (step.reason === undefined) {
        delete taskState.failureReason;
      } else {
        taskState.failureReason = step.reason;
      }
    }
    const goalId = agent.currentGoalId;
    options.onTransition(agent, {
      status: step.status,
      taskId: taskState?.taskId ?? "unknown",
      goalId,
      reason: step.reason
    });
    if (goalId !== undefined) {
      const goal = options.goalFor(agent, goalId);
      if ((goal.cooldownMs ?? 0) > 0) {
        agent.cooldowns.set(goalId, elapsed + (goal.cooldownMs ?? 0));
      }
    }
    agent.task = undefined;
    agent.currentGoalId = undefined;
    agent.currentGoalScore = undefined;
    agent.committedUntil = undefined;
    agent.nextDecisionAt =
      elapsed +
      (step.status === "failed" ? options.failureBackoffMs : options.decisionInterval(agent));
  }
}
