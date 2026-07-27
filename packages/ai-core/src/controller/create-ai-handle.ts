import type { AiBlackboardValue } from "../contracts/blackboard-value";
import type { AiAgentBinding, AiAgentId } from "../contracts/agent-binding";
import { createAiError } from "../contracts/errors";
import type { AiHandle, AiRuntime } from "./runtime";
import type { AiPerceptionFact } from "../perception/perception-fact";
import type { AiRestoreOptions, AiRuntimeCheckpoint } from "../persistence/checkpoint";

export type AiHandleOptions = {
  id?: string | undefined;
};

type AiHandleState = {
  id: string;
  runtime: AiRuntime | undefined;
  ownerId: string | undefined;
};

const handleStates = new WeakMap<AiHandle, AiHandleState>();

export function createAiHandle(options: AiHandleOptions = {}): AiHandle {
  const state: AiHandleState = {
    id: options.id ?? "ai.handle",
    runtime: undefined,
    ownerId: undefined
  };
  const handle: AiHandle = {
    bind(binding: AiAgentBinding) {
      requireBoundRuntime(state, "bind").bind(binding);
    },
    unbind(agentId: AiAgentId, reason?: string) {
      requireBoundRuntime(state, "unbind").unbind(agentId, reason);
    },
    hasAgent(agentId: AiAgentId) {
      return requireBoundRuntime(state, "hasAgent").hasAgent(agentId);
    },
    observe(agentId: AiAgentId, facts: AiPerceptionFact[]) {
      requireBoundRuntime(state, "observe").observe(agentId, facts);
    },
    setBlackboard(agentId: AiAgentId, key: string, value: AiBlackboardValue) {
      requireBoundRuntime(state, "setBlackboard").setBlackboard(agentId, key, value);
    },
    deleteBlackboard(agentId: AiAgentId, key: string) {
      requireBoundRuntime(state, "deleteBlackboard").deleteBlackboard(agentId, key);
    },
    setSchedulerClass(agentId: AiAgentId, schedulerClassId: string) {
      requireBoundRuntime(state, "setSchedulerClass").setSchedulerClass(agentId, schedulerClassId);
    },
    getAgent(agentId: AiAgentId) {
      return requireBoundRuntime(state, "getAgent").getAgent(agentId);
    },
    listAgents() {
      return requireBoundRuntime(state, "listAgents").listAgents();
    },
    scoreGoals(agentId: AiAgentId) {
      return requireBoundRuntime(state, "scoreGoals").scoreGoals(agentId);
    },
    captureCheckpoint(): AiRuntimeCheckpoint {
      return requireBoundRuntime(state, "captureCheckpoint").captureCheckpoint();
    },
    restoreCheckpoint(checkpoint: AiRuntimeCheckpoint, options?: AiRestoreOptions) {
      requireBoundRuntime(state, "restoreCheckpoint").restoreCheckpoint(checkpoint, options);
    },
    snapshot() {
      return requireBoundRuntime(state, "snapshot").snapshot();
    },
    traces() {
      return requireBoundRuntime(state, "traces").traces();
    },
    isBound() {
      return state.runtime !== undefined;
    }
  };
  handleStates.set(handle, state);
  return handle;
}

export function bindAiHandle(handle: AiHandle, runtime: AiRuntime, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime !== undefined) {
    throw createAiError("ai.handle_bound", "AI handle is already bound", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = runtime;
  state.ownerId = ownerId;
}

export function unbindAiHandle(handle: AiHandle, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime === undefined) {
    return;
  }
  if (state.ownerId !== ownerId) {
    throw createAiError("ai.handle_owner_mismatch", "AI handle owner mismatch", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = undefined;
  state.ownerId = undefined;
}

function requireHandleState(handle: AiHandle): AiHandleState {
  const state = handleStates.get(handle);
  if (state === undefined) {
    throw createAiError("ai.handle_invalid", "AI handle must be created with createAiHandle");
  }
  return state;
}

function requireBoundRuntime(
  state: AiHandleState,
  operation: keyof Omit<AiHandle, "isBound">
): AiRuntime {
  if (state.runtime === undefined) {
    throw createAiError("ai.handle_unbound", "AI handle is not bound to a runtime", {
      handleId: state.id,
      operation
    });
  }
  return state.runtime;
}
