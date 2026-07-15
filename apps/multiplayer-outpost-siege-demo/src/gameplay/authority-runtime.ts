import { defineGameModule } from "@gamekit/core";
import type { DataRegistry } from "@gamekit/data";
import { createGame, type GameInstallContext, type GameRuntime } from "@gamekit/game-runtime";
import type { EventBus } from "@gamekit/event-bus";
import {
  createPhysicsHandle,
  createPhysicsLayoutModule,
  createPhysicsModule,
  createPhysicsTraceStore,
  PhysicsBodyComponent,
  PhysicsColliderComponent,
  PhysicsTransformComponent,
  PhysicsVelocityComponent,
  type PhysicsBackendAdapter,
  type PhysicsBodyData,
  type PhysicsColliderData,
  type PhysicsHandle,
  type PhysicsSceneData,
  type PhysicsTraceStore
} from "@gamekit/physics-core";
import type { EntityId, GameWorld } from "@gamekit/world";

import { OUTPOST_ARENA_PHYSICS_LAYOUT_ID, OUTPOST_ARENA_PHYSICS_SCENE_ID } from "../content";
import { OUTPOST_PLAYER_TYPE, type OutpostPlayerDefinition } from "../domain";
import {
  createOutpostIdentityRegistry,
  type OutpostIdentityRegistry
} from "../domain/identity-registry";
import { OutpostGameplayObject } from "./components";

const PLAYER_DEFINITION_ID = "player.outpost.ranger";

export type OutpostAuthorityPlayerInput = {
  sequence: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
};

export type OutpostAuthorityPlayerState = {
  playerId: string;
  slot: number;
  spawn: { x: number; y: number };
  input: OutpostAuthorityPlayerInput;
};

export type OutpostAuthorityPlayerSnapshot = {
  playerId: string;
  slot: number;
  entityId: EntityId;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
};

export type OutpostAuthorityGameplaySnapshot = {
  running: boolean;
  tick: number;
  entityCount: number;
  players: OutpostAuthorityPlayerSnapshot[];
  physics: {
    bound: boolean;
    recentTraceCount: number;
  };
};

export type OutpostAuthorityGameplayRuntime = {
  runtime: GameRuntime;
  identity: OutpostIdentityRegistry;
  physics: PhysicsHandle;
  physicsTrace: PhysicsTraceStore;
  snapshot(): OutpostAuthorityGameplaySnapshot;
};

export type CreateOutpostAuthorityGameplayRuntimeOptions = {
  dataRegistry: DataRegistry;
  world: GameWorld;
  physicsBackend: PhysicsBackendAdapter;
  eventBus: EventBus;
  players(): readonly OutpostAuthorityPlayerState[];
  seed?: string | undefined;
};

type MaterializedPlayer = {
  playerId: string;
  slot: number;
  entityId: EntityId;
};

type AuthorityGameplayState = {
  dataRegistry: DataRegistry;
  world: GameWorld;
  identity: OutpostIdentityRegistry;
  players: Map<string, MaterializedPlayer>;
  playerSource(): readonly OutpostAuthorityPlayerState[];
};

export function createOutpostAuthorityGameplayRuntime(
  options: CreateOutpostAuthorityGameplayRuntimeOptions
): OutpostAuthorityGameplayRuntime {
  const physics = createPhysicsHandle({ id: "outpost.authority.physics" });
  const physicsTrace = createPhysicsTraceStore({ limit: 180 });
  const state: AuthorityGameplayState = {
    dataRegistry: options.dataRegistry,
    world: options.world,
    identity: createOutpostIdentityRegistry(),
    players: new Map(),
    playerSource: options.players
  };
  const runtime = createGame({
    seed: options.seed ?? "outpost-siege.authority.v1",
    world: options.world,
    eventBus: options.eventBus,
    modules: [
      createPhysicsLayoutModule({
        id: "outpost.authority.arena-layout",
        dataRegistry: options.dataRegistry,
        layoutId: OUTPOST_ARENA_PHYSICS_LAYOUT_ID
      }),
      createAuthorityPlayerModule(state),
      createPhysicsModule({
        id: "outpost.authority.physics",
        backend: options.physicsBackend,
        fixedDeltaMs: 1000 / 60,
        maxSubSteps: 4,
        scene: authorityPhysicsScene(options.dataRegistry),
        traceStore: physicsTrace,
        handle: physics
      })
    ]
  });

  return {
    runtime,
    identity: state.identity,
    physics,
    physicsTrace,
    snapshot() {
      const clock = runtime.clock.snapshot();
      return {
        running: runtime.isRunning(),
        tick: clock.ticks,
        entityCount: state.world.count(),
        players: Array.from(state.players.values(), (player) =>
          capturePlayerSnapshot(state.world, player)
        ).sort((left, right) => left.slot - right.slot),
        physics: {
          bound: physics.isBound(),
          recentTraceCount: physicsTrace.list().length
        }
      };
    }
  };
}

function createAuthorityPlayerModule(state: AuthorityGameplayState) {
  const definition = state.dataRegistry.getValue<OutpostPlayerDefinition>(
    OUTPOST_PLAYER_TYPE,
    PLAYER_DEFINITION_ID
  );
  const bodyData = state.dataRegistry.getValue<PhysicsBodyData>(
    "physics.body",
    definition.physicsBody.id
  );
  const colliderRef = bodyData.colliders?.[0];
  if (!colliderRef) {
    throw new Error(`Outpost player body requires a collider: ${bodyData.id}`);
  }
  const colliderData = state.dataRegistry.getValue<PhysicsColliderData>(
    colliderRef.type,
    colliderRef.id
  );

  return defineGameModule<GameInstallContext>({
    id: "outpost.authority.players",
    install(ctx) {
      ctx.systems.register({
        id: "outpost.authority.players.sync",
        update() {
          const desiredPlayers = normalizeDesiredPlayers(state.playerSource());
          removeMissingPlayers(state, desiredPlayers);
          for (const desired of desiredPlayers.values()) {
            const player =
              state.players.get(desired.playerId) ??
              materializePlayer(state, desired, bodyData, colliderData);
            applyPlayerInput(ctx.world, player, desired, definition.moveSpeed);
          }
        }
      });

      return () => {
        for (const player of state.players.values()) {
          state.identity.remove(player.playerId);
          if (ctx.world.has(player.entityId)) {
            ctx.world.despawn(player.entityId);
          }
        }
        state.players.clear();
        state.identity.clear();
      };
    }
  });
}

function normalizeDesiredPlayers(
  players: readonly OutpostAuthorityPlayerState[]
): Map<string, OutpostAuthorityPlayerState> {
  const desired = new Map<string, OutpostAuthorityPlayerState>();
  for (const player of players) {
    if (!desired.has(player.playerId)) {
      desired.set(player.playerId, player);
    }
  }
  return desired;
}

function removeMissingPlayers(
  state: AuthorityGameplayState,
  desired: ReadonlyMap<string, OutpostAuthorityPlayerState>
): void {
  for (const [playerId, player] of state.players) {
    if (desired.has(playerId)) {
      continue;
    }
    state.identity.remove(playerId);
    if (state.world.has(player.entityId)) {
      state.world.despawn(player.entityId);
    }
    state.players.delete(playerId);
  }
}

function materializePlayer(
  state: AuthorityGameplayState,
  player: OutpostAuthorityPlayerState,
  bodyData: PhysicsBodyData,
  colliderData: PhysicsColliderData
): MaterializedPlayer {
  const entityId = state.world.spawn();
  const bodyId = `${player.playerId}.body`;
  const colliderId = `${player.playerId}.collider`;
  const materialized = { playerId: player.playerId, slot: player.slot, entityId };

  try {
    state.world.add(entityId, OutpostGameplayObject, {
      id: player.playerId,
      kind: "player"
    });
    state.world.add(entityId, PhysicsTransformComponent, { position: player.spawn });
    state.world.add(entityId, PhysicsVelocityComponent, { linear: { x: 0, y: 0 } });
    state.world.add(entityId, PhysicsBodyComponent, {
      definition: toBodyDefinition(bodyData, bodyId),
      syncVelocityFromWorld: true
    });
    state.world.add(entityId, PhysicsColliderComponent, {
      definition: toColliderDefinition(colliderData, colliderId)
    });
    state.identity.register({
      gameplayObjectId: player.playerId,
      entityId,
      physicsBodyId: bodyId,
      physicsColliderIds: [colliderId],
      network: { entityId: player.playerId, generation: 0 }
    });
    state.players.set(player.playerId, materialized);
    return materialized;
  } catch (error) {
    state.identity.remove(player.playerId);
    if (state.world.has(entityId)) {
      state.world.despawn(entityId);
    }
    throw error;
  }
}

function applyPlayerInput(
  world: GameWorld,
  player: MaterializedPlayer,
  desired: OutpostAuthorityPlayerState,
  moveSpeed: number
): void {
  const length = Math.hypot(desired.input.moveX, desired.input.moveY);
  const scale = length > 1 ? 1 / length : 1;
  world.set(player.entityId, PhysicsVelocityComponent, {
    linear: {
      x: desired.input.moveX * scale * moveSpeed,
      y: desired.input.moveY * scale * moveSpeed
    }
  });
  const transform = world.get(player.entityId, PhysicsTransformComponent);
  if (!transform) {
    return;
  }
  const aimX = desired.input.aimX - transform.position.x;
  const aimY = desired.input.aimY - transform.position.y;
  if (aimX !== 0 || aimY !== 0) {
    world.set(player.entityId, OutpostGameplayObject, {
      facing: Math.atan2(aimY, aimX)
    });
  }
}

function capturePlayerSnapshot(
  world: GameWorld,
  player: MaterializedPlayer
): OutpostAuthorityPlayerSnapshot {
  const transform = requireComponent(
    world.get(player.entityId, PhysicsTransformComponent),
    `${player.playerId} transform`
  );
  const velocity = requireComponent(
    world.get(player.entityId, PhysicsVelocityComponent),
    `${player.playerId} velocity`
  );
  const gameplay = requireComponent(
    world.get(player.entityId, OutpostGameplayObject),
    `${player.playerId} gameplay object`
  );
  return {
    playerId: player.playerId,
    slot: player.slot,
    entityId: player.entityId,
    x: transform.position.x,
    y: transform.position.y,
    velocityX: velocity.linear.x,
    velocityY: velocity.linear.y,
    facing: gameplay.facing
  };
}

function toBodyDefinition(data: PhysicsBodyData, id: string) {
  const { colliders: _colliders, tags: _tags, ...definition } = data;
  return { ...definition, id };
}

function toColliderDefinition(data: PhysicsColliderData, id: string) {
  const { tags: _tags, ...definition } = data;
  return { ...definition, id };
}

function authorityPhysicsScene(dataRegistry: DataRegistry) {
  const { materials: _materials, ...scene } = dataRegistry.getValue<PhysicsSceneData>(
    "physics.scene",
    OUTPOST_ARENA_PHYSICS_SCENE_ID
  );
  return scene;
}

function requireComponent<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing Outpost authority ${label}`);
  }
  return value;
}
