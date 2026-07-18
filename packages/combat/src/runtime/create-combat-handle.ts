import { createCombatError } from "./errors";
import type {
  CombatCheckpointRestoreOptions,
  CombatDeliveryRequest,
  CombatHandle,
  CombatProjectileCancellation,
  CombatProjectileId,
  CombatProjectileQuery,
  CombatRuntime,
  CombatRuntimeCheckpoint
} from "./types";

export type CombatHandleOptions = {
  id?: string | undefined;
};

type CombatHandleState = {
  id: string;
  runtime: CombatRuntime | undefined;
  ownerId: string | undefined;
};

const handleStates = new WeakMap<CombatHandle, CombatHandleState>();

export function createCombatHandle(options: CombatHandleOptions = {}): CombatHandle {
  const state: CombatHandleState = {
    id: options.id ?? "combat.handle",
    runtime: undefined,
    ownerId: undefined
  };

  const handle: CombatHandle = {
    deliver(request: CombatDeliveryRequest) {
      return requireBoundRuntime(state, "deliver").deliver(request);
    },
    getProjectile(projectileId: CombatProjectileId) {
      return requireBoundRuntime(state, "getProjectile").getProjectile(projectileId);
    },
    listProjectiles(query?: CombatProjectileQuery) {
      return requireBoundRuntime(state, "listProjectiles").listProjectiles(query);
    },
    cancelProjectile(input: CombatProjectileCancellation) {
      return requireBoundRuntime(state, "cancelProjectile").cancelProjectile(input);
    },
    captureCheckpoint(): CombatRuntimeCheckpoint {
      return requireBoundRuntime(state, "captureCheckpoint").captureCheckpoint();
    },
    restoreCheckpoint(
      checkpoint: CombatRuntimeCheckpoint,
      options?: CombatCheckpointRestoreOptions
    ) {
      requireBoundRuntime(state, "restoreCheckpoint").restoreCheckpoint(checkpoint, options);
    },
    snapshot() {
      return requireBoundRuntime(state, "snapshot").snapshot();
    },
    isBound() {
      return state.runtime !== undefined;
    }
  };

  handleStates.set(handle, state);
  return handle;
}

export function bindCombatHandle(
  handle: CombatHandle,
  runtime: CombatRuntime,
  ownerId: string
): void {
  const state = requireHandleState(handle);
  if (state.runtime !== undefined) {
    throw createCombatError("combat.handle_bound", "Combat handle is already bound", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = runtime;
  state.ownerId = ownerId;
}

export function unbindCombatHandle(handle: CombatHandle, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime === undefined) {
    return;
  }
  if (state.ownerId !== ownerId) {
    throw createCombatError("combat.handle_owner_mismatch", "Combat handle owner mismatch", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }
  state.runtime = undefined;
  state.ownerId = undefined;
}

function requireHandleState(handle: CombatHandle): CombatHandleState {
  const state = handleStates.get(handle);
  if (state === undefined) {
    throw createCombatError(
      "combat.handle_invalid",
      "Combat handle must be created with createCombatHandle"
    );
  }
  return state;
}

function requireBoundRuntime(
  state: CombatHandleState,
  operation: keyof Omit<CombatHandle, "isBound">
): CombatRuntime {
  if (state.runtime === undefined) {
    throw createCombatError("combat.handle_unbound", "Combat handle is not bound to a runtime", {
      handleId: state.id,
      operation
    });
  }
  return state.runtime;
}
