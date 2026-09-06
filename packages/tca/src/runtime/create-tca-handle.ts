import { createTcaError } from "./errors";
import type { TcaHandle, TcaRuntime, TcaRuntimeCheckpoint } from "./types";

export type TcaHandleOptions = {
  id?: string;
};

type TcaHandleState = {
  id: string;
  runtime: TcaRuntime | undefined;
  ownerId: string | undefined;
};

const handleStates = new WeakMap<TcaHandle, TcaHandleState>();

export function createTcaHandle(options: TcaHandleOptions = {}): TcaHandle {
  const state: TcaHandleState = {
    id: options.id ?? "tca.handle",
    runtime: undefined,
    ownerId: undefined
  };
  const handle: TcaHandle = {
    captureCheckpoint() {
      return requireBoundRuntime(state, "captureCheckpoint").captureCheckpoint();
    },
    restoreCheckpoint(checkpoint: TcaRuntimeCheckpoint) {
      requireBoundRuntime(state, "restoreCheckpoint").restoreCheckpoint(checkpoint);
    },
    isBound() {
      return state.runtime !== undefined;
    }
  };
  handleStates.set(handle, state);
  return handle;
}

export function bindTcaHandle(handle: TcaHandle, runtime: TcaRuntime, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime !== undefined) {
    throw createTcaError("tca.handle_bound", "TCA handle is already bound", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = runtime;
  state.ownerId = ownerId;
}

export function unbindTcaHandle(handle: TcaHandle, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime === undefined) {
    return;
  }
  if (state.ownerId !== ownerId) {
    throw createTcaError("tca.handle_owner_mismatch", "TCA handle owner mismatch", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = undefined;
  state.ownerId = undefined;
}

function requireHandleState(handle: TcaHandle): TcaHandleState {
  const state = handleStates.get(handle);
  if (state === undefined) {
    throw createTcaError("tca.handle_invalid", "TCA handle must be created with createTcaHandle");
  }
  return state;
}

function requireBoundRuntime(
  state: TcaHandleState,
  operation: "captureCheckpoint" | "restoreCheckpoint"
): TcaRuntime {
  if (state.runtime === undefined) {
    throw createTcaError("tca.handle_unbound", "TCA handle is not bound to a runtime", {
      handleId: state.id,
      operation
    });
  }
  return state.runtime;
}
