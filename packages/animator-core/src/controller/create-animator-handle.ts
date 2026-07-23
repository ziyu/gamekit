import { createAnimatorError } from "../contracts/errors";
import type { AnimatorGameplayPhase } from "../phase/gameplay-phase";
import type { AnimatorHandle, AnimatorRuntime } from "./animator-controller";
import type {
  AnimatorControllerBinding,
  AnimatorParameterValue
} from "../contracts/controller-binding";

export type AnimatorHandleOptions = {
  id?: string | undefined;
};

type AnimatorHandleState = {
  id: string;
  runtime: AnimatorRuntime | undefined;
  ownerId: string | undefined;
};

const handleStates = new WeakMap<AnimatorHandle, AnimatorHandleState>();

export function createAnimatorHandle(options: AnimatorHandleOptions = {}): AnimatorHandle {
  const state: AnimatorHandleState = {
    id: options.id ?? "animator.handle",
    runtime: undefined,
    ownerId: undefined
  };
  const handle: AnimatorHandle = {
    bind(binding: AnimatorControllerBinding) {
      requireBoundRuntime(state, "bind").bind(binding);
    },
    unbind(controllerId: string) {
      requireBoundRuntime(state, "unbind").unbind(controllerId);
    },
    hasController(controllerId: string) {
      return requireBoundRuntime(state, "hasController").hasController(controllerId);
    },
    setParameter(controllerId: string, parameterId: string, value: AnimatorParameterValue) {
      requireBoundRuntime(state, "setParameter").setParameter(controllerId, parameterId, value);
    },
    setParameters(controllerId: string, values: Record<string, AnimatorParameterValue>) {
      requireBoundRuntime(state, "setParameters").setParameters(controllerId, values);
    },
    trigger(controllerId: string, oneShotId: string) {
      requireBoundRuntime(state, "trigger").trigger(controllerId, oneShotId);
    },
    syncGameplayPhase(controllerId: string, phase: AnimatorGameplayPhase) {
      requireBoundRuntime(state, "syncGameplayPhase").syncGameplayPhase(controllerId, phase);
    },
    cancelGameplayPhase(controllerId: string, executionId: string) {
      requireBoundRuntime(state, "cancelGameplayPhase").cancelGameplayPhase(
        controllerId,
        executionId
      );
    },
    reset(controllerId: string, generation?: number) {
      requireBoundRuntime(state, "reset").reset(controllerId, generation);
    },
    getController(controllerId: string) {
      return requireBoundRuntime(state, "getController").getController(controllerId);
    },
    listControllers() {
      return requireBoundRuntime(state, "listControllers").listControllers();
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

export function bindAnimatorHandle(
  handle: AnimatorHandle,
  runtime: AnimatorRuntime,
  ownerId: string
): void {
  const state = requireHandleState(handle);
  if (state.runtime !== undefined) {
    throw createAnimatorError("animator.handle_bound", "Animator handle is already bound", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = runtime;
  state.ownerId = ownerId;
}

export function unbindAnimatorHandle(handle: AnimatorHandle, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime === undefined) {
    return;
  }
  if (state.ownerId !== ownerId) {
    throw createAnimatorError("animator.handle_owner_mismatch", "Animator handle owner mismatch", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = undefined;
  state.ownerId = undefined;
}

function requireHandleState(handle: AnimatorHandle): AnimatorHandleState {
  const state = handleStates.get(handle);
  if (state === undefined) {
    throw createAnimatorError(
      "animator.handle_invalid",
      "Animator handle must be created with createAnimatorHandle"
    );
  }
  return state;
}

function requireBoundRuntime(
  state: AnimatorHandleState,
  operation: keyof Omit<AnimatorHandle, "isBound">
): AnimatorRuntime {
  if (state.runtime === undefined) {
    throw createAnimatorError("animator.handle_unbound", "Animator handle is not bound", {
      handleId: state.id,
      operation
    });
  }
  return state.runtime;
}
