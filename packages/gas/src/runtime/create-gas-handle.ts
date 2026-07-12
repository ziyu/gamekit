import { createGasError } from "./errors";
import type {
  GasAbilityActivation,
  GasActorCreation,
  GasActorId,
  GasAttributeModifier,
  GasEffectApplication,
  GasHandle,
  GasOperationContext,
  GasRuntime,
  GasTagId
} from "./types";

export type GasHandleOptions = {
  id?: string;
};

type GasHandleState = {
  id: string;
  runtime: GasRuntime | undefined;
  ownerId: string | undefined;
};

const handleStates = new WeakMap<GasHandle, GasHandleState>();

export function createGasHandle(options: GasHandleOptions = {}): GasHandle {
  const state: GasHandleState = {
    id: options.id ?? "gas.handle",
    runtime: undefined,
    ownerId: undefined
  };

  const handle: GasHandle = {
    createActor(input: GasActorCreation) {
      return requireBoundRuntime(state, "createActor").createActor(input);
    },
    removeActor(actorId: GasActorId, context?: GasOperationContext) {
      return requireBoundRuntime(state, "removeActor").removeActor(actorId, context);
    },
    hasActor(actorId: GasActorId) {
      return requireBoundRuntime(state, "hasActor").hasActor(actorId);
    },
    getActor(actorId: GasActorId) {
      return requireBoundRuntime(state, "getActor").getActor(actorId);
    },
    actorForEntity(entityId) {
      return requireBoundRuntime(state, "actorForEntity").actorForEntity(entityId);
    },
    activateAbility(input: GasAbilityActivation) {
      return requireBoundRuntime(state, "activateAbility").activateAbility(input);
    },
    applyEffect(input: GasEffectApplication) {
      return requireBoundRuntime(state, "applyEffect").applyEffect(input);
    },
    modifyAttribute(
      actorId: GasActorId,
      modifier: GasAttributeModifier,
      source?: string,
      context?: GasOperationContext
    ) {
      requireBoundRuntime(state, "modifyAttribute").modifyAttribute(
        actorId,
        modifier,
        source,
        context
      );
    },
    addTag(actorId: GasActorId, tag: GasTagId, source?: string, context?: GasOperationContext) {
      requireBoundRuntime(state, "addTag").addTag(actorId, tag, source, context);
    },
    removeTag(actorId: GasActorId, tag: GasTagId, source?: string, context?: GasOperationContext) {
      requireBoundRuntime(state, "removeTag").removeTag(actorId, tag, source, context);
    },
    captureCheckpoint() {
      return requireBoundRuntime(state, "captureCheckpoint").captureCheckpoint();
    },
    restoreCheckpoint(checkpoint, options) {
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

export function bindGasHandle(handle: GasHandle, runtime: GasRuntime, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime !== undefined) {
    throw createGasError("gas.handle_bound", "GAS handle is already bound", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }

  state.runtime = runtime;
  state.ownerId = ownerId;
}

export function unbindGasHandle(handle: GasHandle, ownerId: string): void {
  const state = requireHandleState(handle);
  if (state.runtime === undefined) {
    return;
  }
  if (state.ownerId !== ownerId) {
    throw createGasError("gas.handle_owner_mismatch", "GAS handle owner mismatch", {
      handleId: state.id,
      ownerId: state.ownerId,
      nextOwnerId: ownerId
    });
  }

  state.runtime = undefined;
  state.ownerId = undefined;
}

function requireHandleState(handle: GasHandle): GasHandleState {
  const state = handleStates.get(handle);
  if (state === undefined) {
    throw createGasError("gas.handle_invalid", "GAS handle must be created with createGasHandle");
  }
  return state;
}

function requireBoundRuntime(
  state: GasHandleState,
  operation: keyof Omit<GasHandle, "isBound">
): GasRuntime {
  if (state.runtime === undefined) {
    throw createGasError("gas.handle_unbound", "GAS handle is not bound to a runtime", {
      handleId: state.id,
      operation
    });
  }
  return state.runtime;
}
