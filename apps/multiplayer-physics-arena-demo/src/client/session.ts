import { createStandardMultiplayerPhysicsArenaPrediction } from "@gamekit/app-host";
import { createEventBus } from "@gamekit/event-bus";
import { createGame, type GameInstallContext, type GameRuntime } from "@gamekit/game-runtime";
import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerModule,
  createMultiplayerRuntime,
  defineMultiplayerReplicationSchema,
  type MultiplayerClientReplicationView,
  type MultiplayerRuntime
} from "@gamekit/multiplayer-core";
import type {
  PhysicsBackendAdapter,
  PhysicsBodyState,
  PhysicsPredictionIslandStateSnapshot
} from "@gamekit/physics-core";
import { createKootaWorld } from "@gamekit/world-koota";

import { ARENA_ENVIRONMENT, createArenaDefinitionMap } from "../shared/arena-definition";
import {
  ARENA_BROWSER_CONFIG_PATH,
  ARENA_DEFINITION_VERSION,
  ARENA_FIXED_STEP_MS,
  ARENA_INPUT_KIND,
  ARENA_SCHEMA_VERSION,
  ARENA_SNAPSHOT_KIND,
  arenaAuthorityPeerId
} from "../shared/config";
import { readArenaSnapshot, type ArenaSnapshot } from "../shared/protocol";

export type ArenaClientInput = {
  moveX: number;
  moveZ: number;
  jump: boolean;
};

type ArenaControlState = { sequence: number };

export type ArenaServerConfig = { endpoint: string; roomName: string };
export type ArenaSessionIntent = "create" | "join";

export type ArenaClientSession = {
  peerId: string;
  runtime: MultiplayerRuntime;
  tick(deltaMs: number): void;
  snapshot(): ArenaSnapshot | undefined;
  predictedState(): PhysicsPredictionIslandStateSnapshot | undefined;
  localMemberId(): string | undefined;
  telemetry(): Record<string, unknown>;
  dispose(): Promise<void>;
};

export async function loadArenaServerConfig(
  fetcher: typeof fetch = fetch
): Promise<ArenaServerConfig> {
  const response = await fetcher(ARENA_BROWSER_CONFIG_PATH, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Knockout authority is unavailable (${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    typeof payload.endpoint !== "string" ||
    typeof payload.roomName !== "string"
  ) {
    throw new Error("Knockout authority returned invalid browser configuration.");
  }
  return { endpoint: payload.endpoint, roomName: payload.roomName };
}

export async function createArenaClientSession(options: {
  config: ArenaServerConfig;
  sessionId: string;
  displayName: string;
  intent: ArenaSessionIntent;
  physicsBackend: PhysicsBackendAdapter;
  readInput(): ArenaClientInput;
}): Promise<ArenaClientSession> {
  const peerId = createPeerId();
  const backend = createColyseusMultiplayerBackend({
    id: `knockout.browser.colyseus.${peerId}`,
    endpoint: options.config.endpoint,
    roomName: options.config.roomName,
    joinByIdFallback: true
  });
  const runtime = createMultiplayerRuntime({
    id: `knockout.browser.${peerId}`,
    backend,
    connectContext: {
      localPeer: {
        id: peerId,
        playerId: `participant.${peerId}`,
        displayName: normalizeName(options.displayName),
        role: "client"
      }
    }
  });
  const localPeer = {
    id: peerId,
    playerId: `participant.${peerId}`,
    displayName: normalizeName(options.displayName),
    role: options.intent === "create" ? "host" : "client"
  };
  if (options.intent === "create") {
    await runtime.createSession({
      id: normalizeSessionId(options.sessionId),
      kind: "private",
      authority: "server-authoritative",
      localPeer
    });
  } else {
    await runtime.joinSession({
      sessionId: normalizeSessionId(options.sessionId),
      localPeer
    });
  }

  const sessionId = runtime.session()?.id ?? normalizeSessionId(options.sessionId);
  const authorityPeerId = arenaAuthorityPeerId(sessionId);
  const binding = createMultiplayerAuthorityBindingStore({
    sessionId,
    mode: "server-authoritative",
    authorityPeerId,
    authorityEndpoint: { kind: "server", id: authorityPeerId, peerId: authorityPeerId },
    snapshotVersion: ARENA_SCHEMA_VERSION,
    localPlayerId: peerId
  });
  const definitions = createArenaDefinitionMap();
  let latestSnapshot: ArenaSnapshot | undefined;
  let replication: MultiplayerClientReplicationView<ArenaSnapshot, ArenaControlState> | undefined;

  let readPredictedBody: (memberId: string) => PhysicsBodyState | undefined = () => undefined;
  const arena = createStandardMultiplayerPhysicsArenaPrediction<
    GameInstallContext,
    ArenaSnapshot,
    ArenaClientInput,
    ArenaControlState
  >({
    id: "knockout.client.full-arena",
    maxCommandsPerInput: 6,
    island: {
      backend: options.physicsBackend,
      environment: ARENA_ENVIRONMENT,
      fixedDeltaMs: ARENA_FIXED_STEP_MS,
      maxHistoryTicks: 180,
      maxCheckpointBytes: 8 * 1024 * 1024,
      maxHistoryBytes: 96 * 1024 * 1024,
      maxReplayTicksPerOperation: 120,
      maxMembers: 32,
      maxCommands: 2_048,
      scene: {
        dimension: "3d",
        gravity: { x: 0, y: -18, z: 0 },
        materialDefinitions: [
          { id: "course", friction: 0.85, restitution: 0.05 },
          { id: "actor", friction: 0.55, restitution: 0.08, density: 1 },
          { id: "prop", friction: 0.65, restitution: 0.45, density: 0.7 },
          { id: "hazard", friction: 0.45, restitution: 0.3 }
        ]
      }
    },
    selectFrame({ snapshot }) {
      return {
        ...snapshot.frame,
        acknowledgedInputSequence: snapshot.inputAcksByPeerId[peerId] ?? 0
      };
    },
    resolveMemberDefinition(member) {
      return definitions.get(member.id);
    },
    mapInput({ input, snapshot, predictionTick }) {
      const memberId = snapshot.playerIdsByPeerId[peerId];
      if (!memberId || snapshot.eliminatedMemberIds.includes(memberId)) return [];
      const body = readPredictedBody(memberId);
      const length = Math.hypot(input.moveX, input.moveZ);
      const scale = length > 1 ? 1 / length : 1;
      const angle = predictionTick * 0.028;
      return [
        {
          type: "patch" as const,
          memberId,
          patch: {
            linearVelocity: {
              x: input.moveX * scale * 6.4,
              y:
                input.jump && Math.abs(body?.linearVelocity.y ?? 1) < 0.35
                  ? 7.2
                  : (body?.linearVelocity.y ?? 0),
              z: input.moveZ * scale * 6.4
            }
          }
        },
        {
          type: "patch" as const,
          memberId: "hazard.sweeper",
          patch: {
            rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }
          }
        },
        {
          type: "patch" as const,
          memberId: "platform.left",
          patch: {
            position: { x: -5.8, y: 1.2 + Math.sin(predictionTick * 0.025) * 1.15, z: -8.7 }
          }
        },
        {
          type: "patch" as const,
          memberId: "platform.right",
          patch: {
            position: {
              x: 5.8,
              y: 1.2 + Math.sin(predictionTick * 0.025 + Math.PI) * 1.15,
              z: -8.7
            }
          }
        }
      ];
    }
  });
  readPredictedBody = (memberId) => arena.body(memberId);

  const schema = defineMultiplayerReplicationSchema<ArenaSnapshot, string, ArenaSnapshot>({
    id: "knockout.arena",
    version: ARENA_SCHEMA_VERSION,
    decode: readArenaSnapshot,
    tick: (snapshot) => snapshot.frame.tick,
    time: (snapshot) => snapshot.frame.tick * ARENA_FIXED_STEP_MS,
    serverTime: (snapshot) => snapshot.serverTime,
    snapshotVersion: () => ARENA_DEFINITION_VERSION,
    local: {
      select: (snapshot) => snapshot,
      acknowledgedSequence: (snapshot, identity) => snapshot.inputAcksByPeerId[identity] ?? 0
    }
  }).bindClient<ArenaControlState, GameInstallContext>({
    identity: () => peerId,
    state: (snapshot) => ({ sequence: snapshot.inputAcksByPeerId[peerId] ?? 0 })
  });

  const module = createMultiplayerModule<
    GameInstallContext,
    ArenaSnapshot,
    ArenaClientInput,
    ArenaControlState
  >({
    id: "knockout.client.multiplayer",
    runtime,
    clientPredictionDomains: [arena.descriptor],
    clientReplication: {
      id: "knockout.client.replication",
      snapshotKind: ARENA_SNAPSHOT_KIND,
      authority: { binding },
      schema,
      playback: {
        interpolationDelayMs: 50,
        maxSnapshots: 24,
        timeSource: "tick",
        readTime: (entry) =>
          entry.tick === undefined ? undefined : entry.tick * ARENA_FIXED_STEP_MS,
        shouldReset(previous, next) {
          return (
            previous !== undefined &&
            (next.round !== previous.round || next.frame.tick < previous.frame.tick)
          );
        }
      },
      applyAuthoritative({ snapshot }) {
        latestSnapshot = snapshot;
      },
      prediction: {
        inputKind: ARENA_INPUT_KIND,
        inputRateHz: 60,
        maxCatchUpSteps: 3,
        maxInFlightSends: 6,
        maxPredictionLeadInputs: 12,
        inputDelivery: { mode: "redundant-bundle", maxFramesPerBundle: 6 },
        buffer: {
          cloneState: (state) => ({ ...state }),
          applyInput(state, _input, context) {
            state.sequence = context.sequence;
            return state;
          },
          maxInputs: 24,
          predictionStepMs: ARENA_FIXED_STEP_MS
        },
        readInput() {
          return options.readInput();
        },
        encodeInput({ input, predictionFrame }) {
          return { sequence: predictionFrame.sequence, ...input };
        },
        active({ snapshot }) {
          return snapshot.phase === "running";
        }
      },
      applyFrame({ snapshot }) {
        latestSnapshot = snapshot;
      },
      expose(view) {
        replication = view;
      }
    }
  });
  const game: GameRuntime = createGame({
    seed: `knockout.client.${peerId}`,
    world: createKootaWorld(),
    eventBus: createEventBus(),
    modules: [module]
  });
  game.start();

  return {
    peerId,
    runtime,
    tick(deltaMs) {
      game.tick(deltaMs);
    },
    snapshot() {
      return latestSnapshot;
    },
    predictedState() {
      return arena.state();
    },
    localMemberId() {
      return latestSnapshot?.playerIdsByPeerId[peerId];
    },
    telemetry() {
      const replicationDiagnostics = replication?.diagnostics();
      const arenaDiagnostics = arena.diagnostics();
      return {
        peer: peerId,
        authorityTick: latestSnapshot?.frame.tick ?? 0,
        localMember: latestSnapshot?.playerIdsByPeerId[peerId] ?? "spectator",
        phase: latestSnapshot?.phase ?? "awaiting",
        authority: latestSnapshot?.authority,
        replication: replicationDiagnostics
          ? {
              received: replicationDiagnostics.receivedSnapshots,
              applied: replicationDiagnostics.appliedSnapshots,
              bundles: replicationDiagnostics.sentInputBundles,
              redundantFrames: replicationDiagnostics.redundantInputFrames,
              pendingInputs: replicationDiagnostics.pendingEncodedInputs,
              corrections: replicationDiagnostics.prediction?.corrections ?? 0
            }
          : undefined,
        island: {
          status: arenaDiagnostics.status,
          baselineInstalls: arenaDiagnostics.baselineInstalls,
          reconciliations: arenaDiagnostics.reconciliations,
          hardCorrections: arenaDiagnostics.lastReconciliation?.hardCorrection?.status,
          resimulatedTicks: arenaDiagnostics.island?.resimulatedTicks ?? 0,
          historyBytes: arenaDiagnostics.island?.historyBytes ?? 0,
          maxCheckpointBytes: arenaDiagnostics.island?.maxCheckpointBytesObserved ?? 0,
          replayBudgetOverflows: arenaDiagnostics.island?.replayBudgetOverflows ?? 0
        }
      };
    },
    async dispose() {
      game.dispose();
      binding.close("Knockout client disposed");
      await runtime.dispose();
    }
  };
}

export function normalizeSessionId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (normalized.length < 4) throw new Error("Session code needs at least four characters.");
  return normalized;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 18) || "TURBO BEAN";
}

function createPeerId(): string {
  const source = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `bean-${source
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
