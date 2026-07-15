import type { CameraController, CameraState2D, PointLike } from "@gamekit/camera-core";
import { defineGameModule } from "@gamekit/core";
import type { DataRegistry } from "@gamekit/data";
import { createEventBus, type EventBus } from "@gamekit/event-bus";
import { createGame, type GameInstallContext, type GameRuntime } from "@gamekit/game-runtime";
import {
  createMultiplayerModule,
  defineSnapshotAngleTrack,
  defineSnapshotVector2Track,
  type MultiplayerClientReplicationDiagnostics,
  type MultiplayerClientReplicationView,
  type MultiplayerRuntime,
  type NetworkVector2,
  type PresentedSnapshotTracks
} from "@gamekit/multiplayer-core";
import { PhysicsTransformComponent, PhysicsVelocityComponent } from "@gamekit/physics-core";
import type { RendererAdapter } from "@gamekit/renderer-core";
import type { EntityId, GameWorld } from "@gamekit/world";

import { OUTPOST_PLAYER_TYPE, type OutpostPlayerDefinition } from "../domain";
import {
  createOutpostIdentityRegistry,
  type OutpostIdentityRegistry
} from "../domain/identity-registry";
import {
  createOutpostClientPresentationModule,
  type OutpostRenderTargetWriter
} from "../presentation";
import { OutpostGameplayObject, OutpostPresentation } from "./components";
import { OUTPOST_ARENA } from "./constants";
import {
  clearOutpostTransientInput,
  createOutpostInputState,
  type OutpostInputState
} from "./input";

const PLAYER_DEFINITION_ID = "player.outpost.ranger";
const MAX_PARTICIPANTS = 8;
const MAX_PLAYERS = 4;

export type OutpostClientMatchPhase = "lobby" | "countdown" | "running";

export type OutpostClientParticipantSnapshot = {
  peerId: string;
  playerId: string;
  status: "active" | "next-round" | "spectator";
  ready: boolean;
  slot?: number;
  displayName?: string;
};

export type OutpostClientPlayerSnapshot = {
  playerId: string;
  slot: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
};

export type OutpostClientAuthoritySnapshot = {
  phase: OutpostClientMatchPhase;
  tick: number;
  countdownMsRemaining: number;
  participants: OutpostClientParticipantSnapshot[];
  players: OutpostClientPlayerSnapshot[];
  inputAcksByPeerId: Record<string, number>;
};

export type OutpostClientShadowSnapshot = {
  mode: "remote-authority-shadow";
  running: boolean;
  authorityPeerId?: string;
  receivedSnapshots: number;
  rejectedSnapshots: number;
  lastReceivedTick: number;
  lastAppliedTick: number;
  entityCount: number;
  match?: OutpostClientAuthoritySnapshot;
  replication?: MultiplayerClientReplicationDiagnostics;
};

export type OutpostClientShadowRuntime = {
  runtime: GameRuntime;
  input: OutpostInputState;
  identity: OutpostIdentityRegistry;
  screenToWorld(point: PointLike): PointLike;
  view(): OutpostClientAuthoritySnapshot | undefined;
  snapshot(): OutpostClientShadowSnapshot;
};

export type OutpostClientCameraAdapter = {
  applyCameraState(state: CameraState2D): void;
};

export type CreateOutpostClientShadowRuntimeOptions = {
  dataRegistry: DataRegistry;
  world: GameWorld;
  multiplayer: MultiplayerRuntime;
  localPlayerId: string;
  renderer?: RendererAdapter | undefined;
  applyRenderTargetState?: OutpostRenderTargetWriter | undefined;
  camera?: CameraController | undefined;
  cameraAdapter?: OutpostClientCameraAdapter | undefined;
  eventBus?: EventBus | undefined;
  seed?: string | undefined;
};

type MaterializedClientPlayer = {
  playerId: string;
  slot: number;
  entityId: EntityId;
  renderObjectId: string;
};

type ClientShadowState = {
  dataRegistry: DataRegistry;
  world: GameWorld;
  localPlayerId: string;
  input: OutpostInputState;
  identity: OutpostIdentityRegistry;
  players: Map<string, MaterializedClientPlayer>;
  presentedPlayers: Map<string, OutpostPresentedPlayerState>;
  replication?: MultiplayerClientReplicationView<
    OutpostClientAuthoritySnapshot,
    OutpostPredictedPlayerState
  >;
  received?: OutpostClientAuthoritySnapshot;
  lastAppliedTick: number;
};

type OutpostPredictionInput = {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
};

type OutpostPredictedPlayerState = {
  playerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
};

type OutpostPresentedPlayerState = {
  position: NetworkVector2;
  velocityX: number;
  velocityY: number;
  facing: number;
};

export function createOutpostClientShadowRuntime(
  options: CreateOutpostClientShadowRuntimeOptions
): OutpostClientShadowRuntime {
  const eventBus = options.eventBus ?? createEventBus({ clock: () => Date.now() });
  const state: ClientShadowState = {
    dataRegistry: options.dataRegistry,
    world: options.world,
    localPlayerId: options.localPlayerId,
    input: createOutpostInputState(),
    identity: createOutpostIdentityRegistry(),
    players: new Map(),
    presentedPlayers: new Map(),
    lastAppliedTick: -1
  };
  const runtime = createGame({
    seed: options.seed ?? `outpost.client.${options.localPlayerId}`,
    world: options.world,
    eventBus,
    modules: [
      createClientReplicationModule(state, options.multiplayer),
      createClientShadowCameraModule(state, options.camera, options.cameraAdapter),
      ...(options.renderer
        ? [
            createOutpostClientPresentationModule({
              dataRegistry: options.dataRegistry,
              renderer: options.renderer,
              applyRenderTargetState: options.applyRenderTargetState,
              readPlayerState(playerId) {
                return state.presentedPlayers.get(playerId);
              }
            })
          ]
        : []),
      createClientShadowInputResetModule(state),
      createClientShadowLifecycleModule(state)
    ]
  });

  return {
    runtime,
    input: state.input,
    identity: state.identity,
    screenToWorld(point) {
      return options.camera?.screenToWorld(point) ?? point;
    },
    view() {
      return state.received ? cloneAuthoritySnapshot(state.received) : undefined;
    },
    snapshot() {
      const replication = state.replication?.diagnostics();
      const binding = state.replication?.binding();
      return {
        mode: "remote-authority-shadow",
        running: runtime.isRunning(),
        ...(binding?.authorityPeerId === undefined
          ? {}
          : { authorityPeerId: binding.authorityPeerId }),
        receivedSnapshots: replication?.receivedSnapshots ?? 0,
        rejectedSnapshots: replication?.rejectedSnapshots ?? 0,
        lastReceivedTick: state.received?.tick ?? -1,
        lastAppliedTick: state.lastAppliedTick,
        entityCount: state.world.count(),
        ...(state.received === undefined ? {} : { match: cloneAuthoritySnapshot(state.received) }),
        ...(replication === undefined ? {} : { replication })
      };
    }
  };
}

function createClientReplicationModule(state: ClientShadowState, multiplayer: MultiplayerRuntime) {
  const playerDefinition = state.dataRegistry.getValue<OutpostPlayerDefinition>(
    OUTPOST_PLAYER_TYPE,
    PLAYER_DEFINITION_ID
  );
  const predictionStepMs = 1000 / 30;
  const fallbackPosition = { x: 0, y: 0 };
  return createMultiplayerModule<
    GameInstallContext,
    OutpostClientAuthoritySnapshot,
    OutpostPredictionInput,
    OutpostPredictedPlayerState
  >({
    id: "outpost.client.multiplayer",
    runtime: multiplayer,
    clientReplication: {
      id: "outpost.client.replication",
      playback: {
        interpolationDelayMs: 50,
        adaptiveDelay: {
          minDelayMs: 50,
          maxDelayMs: 150,
          jitterMultiplier: 2
        },
        maxSnapshots: 24,
        timeSource: "tick",
        readTime(entry) {
          return entry.tick === undefined ? undefined : entry.tick * 50;
        },
        shouldReset(previous, next) {
          return (
            previous !== undefined && (next.tick < previous.tick || previous.phase !== next.phase)
          );
        }
      },
      tracks: [
        defineSnapshotVector2Track<OutpostClientAuthoritySnapshot>({
          snapDistance: 160,
          selectInto(snapshot, writer) {
            for (const player of snapshot.players) {
              writer.add(playerPositionKey(player.playerId), { x: player.x, y: player.y });
            }
          }
        }),
        defineSnapshotAngleTrack<OutpostClientAuthoritySnapshot>({
          selectInto(snapshot, writer) {
            for (const player of snapshot.players) {
              writer.add(playerFacingKey(player.playerId), player.facing);
            }
          }
        })
      ],
      readSnapshot: readOutpostClientAuthoritySnapshot,
      toBufferEntry({ snapshot, message }) {
        return {
          snapshot,
          tick: snapshot.tick,
          receivedAt: message.timestamp
        };
      },
      applyAuthoritative({ installContext, snapshot }) {
        applyAuthoritativeSnapshot(
          state,
          installContext.world,
          snapshot,
          playerDefinition.renderObject.id
        );
      },
      prediction: {
        inputRateHz: 30,
        maxCatchUpSteps: 2,
        maxInFlightSends: 4,
        buffer: {
          cloneState: clonePredictedPlayerState,
          applyInput(predicted, input) {
            return applyPredictedInput(
              predicted,
              input,
              playerDefinition.moveSpeed,
              predictionStepMs
            );
          },
          presentState(from, to, presentation) {
            from.x += (to.x - from.x) * presentation.alpha;
            from.y += (to.y - from.y) * presentation.alpha;
            from.velocityX = to.velocityX;
            from.velocityY = to.velocityY;
            from.facing = to.facing;
            return from;
          },
          measureCorrection(previous, next) {
            return Math.hypot(previous.x - next.x, previous.y - next.y);
          },
          correctionSmoothing: {
            durationMs: 100,
            maxMagnitude: 48,
            apply(target, correction) {
              target.x +=
                (correction.previousPresentedState.x - correction.initialTargetState.x) *
                correction.remainingAlpha;
              target.y +=
                (correction.previousPresentedState.y - correction.initialTargetState.y) *
                correction.remainingAlpha;
              return target;
            }
          },
          predictionStepMs
        },
        readInput() {
          return {
            moveX: state.input.moveX,
            moveY: state.input.moveY,
            aimX: state.input.aimX,
            aimY: state.input.aimY
          };
        },
        encodeInput({ input, predictionFrame }) {
          return { sequence: predictionFrame.sequence, ...input };
        },
        readAuthoritativeState({ snapshot }) {
          const player = snapshot.players.find(
            (candidate) => candidate.playerId === state.localPlayerId
          );
          return player === undefined ? undefined : predictedStateFromSnapshot(player);
        },
        readAcknowledgedSequence({ runtime, snapshot }) {
          const peerId = runtime.localPeer()?.id;
          return peerId === undefined ? undefined : snapshot.inputAcksByPeerId[peerId];
        },
        active({ snapshot }) {
          return snapshot.phase === "running";
        }
      },
      applyFrame({ snapshot, presented, predictedState }) {
        applyPresentedSnapshot(state, snapshot, presented, predictedState, fallbackPosition);
      },
      expose(view) {
        if (view === undefined) {
          delete state.replication;
        } else {
          state.replication = view;
        }
      }
    }
  });
}

function applyAuthoritativeSnapshot(
  state: ClientShadowState,
  world: GameWorld,
  snapshot: OutpostClientAuthoritySnapshot,
  renderKey: string
): void {
  const desired = new Map(snapshot.players.map((player) => [player.playerId, player]));
  for (const [playerId, materialized] of state.players) {
    if (desired.has(playerId)) {
      continue;
    }
    state.identity.remove(playerId);
    state.presentedPlayers.delete(playerId);
    if (world.has(materialized.entityId)) {
      world.despawn(materialized.entityId);
    }
    state.players.delete(playerId);
  }
  for (const player of snapshot.players) {
    const materialized =
      state.players.get(player.playerId) ??
      materializeClientPlayer(state, world, player, renderKey);
    world.set(materialized.entityId, PhysicsTransformComponent, {
      position: { x: player.x, y: player.y }
    });
    world.set(materialized.entityId, PhysicsVelocityComponent, {
      linear: { x: player.velocityX, y: player.velocityY }
    });
    world.set(materialized.entityId, OutpostGameplayObject, { facing: player.facing });
  }
  state.received = snapshot;
  state.lastAppliedTick = snapshot.tick;
}

function applyPresentedSnapshot(
  state: ClientShadowState,
  snapshot: OutpostClientAuthoritySnapshot,
  presented: PresentedSnapshotTracks,
  predictedState: OutpostPredictedPlayerState | undefined,
  fallbackPosition: NetworkVector2
): void {
  for (const player of snapshot.players) {
    let target = state.presentedPlayers.get(player.playerId);
    if (target === undefined) {
      target = {
        position: { x: player.x, y: player.y },
        velocityX: player.velocityX,
        velocityY: player.velocityY,
        facing: player.facing
      };
      state.presentedPlayers.set(player.playerId, target);
    }
    if (predictedState?.playerId === player.playerId) {
      target.position.x = predictedState.x;
      target.position.y = predictedState.y;
      target.velocityX = predictedState.velocityX;
      target.velocityY = predictedState.velocityY;
      target.facing = predictedState.facing;
      continue;
    }
    fallbackPosition.x = player.x;
    fallbackPosition.y = player.y;
    presented.vector2Into(playerPositionKey(player.playerId), target.position, fallbackPosition);
    target.velocityX = player.velocityX;
    target.velocityY = player.velocityY;
    target.facing = presented.angleRadians(playerFacingKey(player.playerId), player.facing);
  }
  for (const playerId of state.presentedPlayers.keys()) {
    if (!snapshot.players.some((player) => player.playerId === playerId)) {
      state.presentedPlayers.delete(playerId);
    }
  }
}

function predictedStateFromSnapshot(
  player: OutpostClientPlayerSnapshot
): OutpostPredictedPlayerState {
  return {
    playerId: player.playerId,
    x: player.x,
    y: player.y,
    velocityX: player.velocityX,
    velocityY: player.velocityY,
    facing: player.facing
  };
}

function clonePredictedPlayerState(
  state: OutpostPredictedPlayerState
): OutpostPredictedPlayerState {
  return { ...state };
}

function applyPredictedInput(
  state: OutpostPredictedPlayerState,
  input: OutpostPredictionInput,
  moveSpeed: number,
  stepMs: number
): OutpostPredictedPlayerState {
  const length = Math.hypot(input.moveX, input.moveY);
  const scale = length > 1 ? 1 / length : 1;
  state.velocityX = input.moveX * scale * moveSpeed;
  state.velocityY = input.moveY * scale * moveSpeed;
  state.x += state.velocityX * (stepMs / 1000);
  state.y += state.velocityY * (stepMs / 1000);
  const aimX = input.aimX - state.x;
  const aimY = input.aimY - state.y;
  if (aimX !== 0 || aimY !== 0) {
    state.facing = Math.atan2(aimY, aimX);
  }
  return state;
}

function playerPositionKey(playerId: string): string {
  return `player:${playerId}:position`;
}

function playerFacingKey(playerId: string): string {
  return `player:${playerId}:facing`;
}

function materializeClientPlayer(
  state: ClientShadowState,
  world: GameWorld,
  player: OutpostClientPlayerSnapshot,
  renderKey: string
): MaterializedClientPlayer {
  const entityId = world.spawn();
  const renderObjectId = `outpost.client.player.${player.slot}`;
  const materialized = { playerId: player.playerId, slot: player.slot, entityId, renderObjectId };
  try {
    world.add(entityId, OutpostGameplayObject, {
      id: player.playerId,
      kind: "player",
      facing: player.facing
    });
    world.add(entityId, PhysicsTransformComponent, { position: { x: player.x, y: player.y } });
    world.add(entityId, PhysicsVelocityComponent, {
      linear: { x: player.velocityX, y: player.velocityY }
    });
    world.add(entityId, OutpostPresentation, { renderKey, renderObjectId });
    state.identity.register({
      gameplayObjectId: player.playerId,
      entityId,
      network: { entityId: player.playerId, generation: 0 },
      renderObjectId
    });
    state.players.set(player.playerId, materialized);
    return materialized;
  } catch (error) {
    state.identity.remove(player.playerId);
    if (world.has(entityId)) {
      world.despawn(entityId);
    }
    throw error;
  }
}

function createClientShadowCameraModule(
  state: ClientShadowState,
  camera: CameraController | undefined,
  cameraAdapter: OutpostClientCameraAdapter | undefined
) {
  return defineGameModule<GameInstallContext>({
    id: "outpost.client.camera",
    install(ctx) {
      if (!camera) {
        return;
      }
      ctx.systems.register({
        id: "outpost.client.camera.follow",
        update({ delta }) {
          if (state.input.cameraZoomDelta !== 0) {
            const viewport = camera.getState().viewport;
            camera.zoom(state.input.cameraZoomDelta < 0 ? 1 : -1, {
              x: state.input.cameraZoomX ?? viewport.width / 2,
              y: state.input.cameraZoomY ?? viewport.height / 2
            });
          }
          const local = state.players.get(state.localPlayerId);
          const transform = local
            ? ctx.world.get(local.entityId, PhysicsTransformComponent)
            : undefined;
          const presented = state.presentedPlayers.get(state.localPlayerId);
          camera.setState({
            mode: transform ? "follow" : "free",
            ...(local ? { targetEntity: local.entityId } : {}),
            x: presented?.position.x ?? transform?.position.x ?? OUTPOST_ARENA.width / 2,
            y: presented?.position.y ?? transform?.position.y ?? OUTPOST_ARENA.height / 2,
            bounds: { x: 0, y: 0, width: OUTPOST_ARENA.width, height: OUTPOST_ARENA.height }
          });
          cameraAdapter?.applyCameraState(camera.update(delta));
        }
      });
    }
  });
}

function createClientShadowInputResetModule(state: ClientShadowState) {
  return defineGameModule<GameInstallContext>({
    id: "outpost.client.input-reset",
    install(ctx) {
      ctx.systems.register({
        id: "outpost.client.input-reset.clear",
        update() {
          clearOutpostTransientInput(state.input);
        }
      });
    }
  });
}

function createClientShadowLifecycleModule(state: ClientShadowState) {
  return defineGameModule<GameInstallContext>({
    id: "outpost.client.lifecycle",
    install(ctx) {
      return () => {
        for (const player of state.players.values()) {
          if (ctx.world.has(player.entityId)) {
            ctx.world.despawn(player.entityId);
          }
        }
        state.players.clear();
        state.presentedPlayers.clear();
        state.identity.clear();
        delete state.replication;
        delete state.received;
      };
    }
  });
}

export function readOutpostClientAuthoritySnapshot(
  value: unknown
): OutpostClientAuthoritySnapshot | undefined {
  if (
    !isRecord(value) ||
    !isMatchPhase(value.phase) ||
    !nonNegativeInteger(value.tick) ||
    !nonNegativeFinite(value.countdownMsRemaining) ||
    !Array.isArray(value.participants) ||
    value.participants.length > MAX_PARTICIPANTS ||
    !Array.isArray(value.players) ||
    value.players.length > MAX_PLAYERS ||
    !isRecord(value.inputAcksByPeerId)
  ) {
    return undefined;
  }
  const participants = value.participants.map(readParticipant);
  const players = value.players.map(readPlayer);
  if (participants.some((participant) => !participant) || players.some((player) => !player)) {
    return undefined;
  }
  const inputAcksByPeerId: Record<string, number> = {};
  for (const [peerId, sequence] of Object.entries(value.inputAcksByPeerId)) {
    if (!nonEmptyString(peerId) || !nonNegativeInteger(sequence)) {
      return undefined;
    }
    inputAcksByPeerId[peerId] = sequence;
  }
  return {
    phase: value.phase,
    tick: value.tick,
    countdownMsRemaining: value.countdownMsRemaining,
    participants: participants as OutpostClientParticipantSnapshot[],
    players: players as OutpostClientPlayerSnapshot[],
    inputAcksByPeerId
  };
}

function readParticipant(value: unknown): OutpostClientParticipantSnapshot | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.peerId) ||
    !nonEmptyString(value.playerId) ||
    (value.status !== "active" && value.status !== "next-round" && value.status !== "spectator") ||
    typeof value.ready !== "boolean" ||
    (value.slot !== undefined && !nonNegativeInteger(value.slot)) ||
    (value.displayName !== undefined && typeof value.displayName !== "string")
  ) {
    return undefined;
  }
  return {
    peerId: value.peerId,
    playerId: value.playerId,
    status: value.status,
    ready: value.ready,
    ...(value.slot === undefined ? {} : { slot: value.slot }),
    ...(value.displayName === undefined ? {} : { displayName: value.displayName.slice(0, 24) })
  };
}

function readPlayer(value: unknown): OutpostClientPlayerSnapshot | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.playerId) ||
    !nonNegativeInteger(value.slot) ||
    !finite(value.x) ||
    !finite(value.y) ||
    !finite(value.velocityX) ||
    !finite(value.velocityY) ||
    !finite(value.facing)
  ) {
    return undefined;
  }
  return {
    playerId: value.playerId,
    slot: value.slot,
    x: value.x,
    y: value.y,
    velocityX: value.velocityX,
    velocityY: value.velocityY,
    facing: value.facing
  };
}

function cloneAuthoritySnapshot(
  snapshot: OutpostClientAuthoritySnapshot
): OutpostClientAuthoritySnapshot {
  return {
    ...snapshot,
    participants: snapshot.participants.map((participant) => ({ ...participant })),
    players: snapshot.players.map((player) => ({ ...player })),
    inputAcksByPeerId: { ...snapshot.inputAcksByPeerId }
  };
}

function isMatchPhase(value: unknown): value is OutpostClientMatchPhase {
  return value === "lobby" || value === "countdown" || value === "running";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
