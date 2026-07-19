import { createNavigationError } from "./errors";
import type { NavigationHandle, NavigationRuntime } from "./types";

export type NavigationHandleOptions = {
  id?: string | undefined;
};

type NavigationHandleState = {
  id: string;
  runtime: NavigationRuntime | undefined;
  ownerId: string | undefined;
};

const handleStates = new WeakMap<NavigationHandle, NavigationHandleState>();

export function createNavigationHandle(options: NavigationHandleOptions = {}): NavigationHandle {
  const state: NavigationHandleState = {
    id: options.id ?? "navigation.handle",
    runtime: undefined,
    ownerId: undefined
  };
  const handle: NavigationHandle = {
    projectPoint(point, profileId) {
      return requireBoundRuntime(state, "projectPoint").projectPoint(point, profileId);
    },
    requestPath(request) {
      return requireBoundRuntime(state, "requestPath").requestPath(request);
    },
    poll(requestId) {
      return requireBoundRuntime(state, "poll").poll(requestId);
    },
    cancel(requestId) {
      requireBoundRuntime(state, "cancel").cancel(requestId);
    },
    sampleRoute(routeId, point) {
      return requireBoundRuntime(state, "sampleRoute").sampleRoute(routeId, point);
    },
    revision() {
      return requireBoundRuntime(state, "revision").revision();
    },
    snapshot() {
      return requireBoundRuntime(state, "snapshot").snapshot();
    },
    updateObstacle(update) {
      return requireBoundRuntime(state, "updateObstacle").updateObstacle(update);
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

export function bindNavigationHandle(
  handle: NavigationHandle,
  runtime: NavigationRuntime,
  ownerId: string
): void {
  const state = requireHandleState(handle);
  if (state.runtime !== undefined) {
    throw createNavigationError("navigation.handle_bound", "Navigation handle is already bound", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = runtime;
  state.ownerId = ownerId;
}

export function unbindNavigationHandle(handle: NavigationHandle, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime === undefined) {
    return;
  }
  if (state.ownerId !== ownerId) {
    throw createNavigationError(
      "navigation.handle_owner_mismatch",
      "Navigation handle owner mismatch",
      { handleId: state.id, ownerId: state.ownerId, nextOwnerId: ownerId }
    );
  }
  state.runtime = undefined;
  state.ownerId = undefined;
}

function requireHandleState(handle: NavigationHandle): NavigationHandleState {
  const state = handleStates.get(handle);
  if (state === undefined) {
    throw createNavigationError(
      "navigation.handle_invalid",
      "Navigation handle must be created with createNavigationHandle"
    );
  }
  return state;
}

function requireBoundRuntime(
  state: NavigationHandleState,
  operation: keyof Omit<NavigationHandle, "isBound">
): NavigationRuntime {
  if (state.runtime === undefined) {
    throw createNavigationError(
      "navigation.handle_unbound",
      "Navigation handle is not bound to a runtime",
      { handleId: state.id, operation }
    );
  }
  return state.runtime;
}
