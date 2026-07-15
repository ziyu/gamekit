import { createConfiguredAppHost, type AppHostSnapshot } from "@gamekit/app-host";
import type { MultiplayerRuntime } from "@gamekit/multiplayer-core";
import type {
  ColyseusRoomOwnedRuntime,
  ColyseusRoomRuntimeFrame
} from "@gamekit/multiplayer-colyseus/server";
import type { PhysicsBackendAdapter } from "@gamekit/physics-core";
import { initRapier2dPhysicsBackend } from "@gamekit/physics-rapier2d";

import { outpostAppDefinition } from "../app-definition";
import {
  createOutpostAuthorityGameplayRuntime,
  type OutpostAuthorityGameplayRuntime
} from "../gameplay";
import {
  createOutpostHeadlessServerProfile,
  type OutpostHeadlessServerContext
} from "../profiles/headless-server";
import { createOutpostMatchAuthority, type OutpostMatchAuthoritySnapshot } from "../realtime";

export type OutpostRoomAuthorityRuntimeSnapshot = {
  hostPhase: AppHostSnapshot["phase"];
  running: boolean;
  tick: number;
  entityCount: number;
  physicsBound: boolean;
  physicsBackend: string;
  match: OutpostMatchAuthoritySnapshot;
};

export type CreateOutpostRoomAuthorityRuntimeOptions = {
  multiplayer: MultiplayerRuntime;
  physicsBackend?: PhysicsBackendAdapter;
  clock?: () => number;
  seed?: string;
  countdownMs?: number;
  minPlayers?: number;
  maxPlayers?: number;
};

export async function createOutpostRoomAuthorityRuntime(
  options: CreateOutpostRoomAuthorityRuntimeOptions
): Promise<ColyseusRoomOwnedRuntime<OutpostRoomAuthorityRuntimeSnapshot>> {
  const clock = options.clock ?? (() => Date.now());
  const context: OutpostHeadlessServerContext = { assetDiagnostics: [] };
  const physicsBackend =
    options.physicsBackend ??
    (await initRapier2dPhysicsBackend({ id: "outpost.room-authority.rapier2d" }));
  const session = options.multiplayer.session();
  const authorityPeer = options.multiplayer.localPeer();
  if (!session || !authorityPeer) {
    throw new Error("Outpost Room authority requires an active multiplayer-core session.");
  }
  let gameplay: OutpostAuthorityGameplayRuntime | undefined;
  const match = createOutpostMatchAuthority({
    runtime: options.multiplayer,
    sessionId: session.id,
    authorityPeerId: authorityPeer.id,
    ...(options.countdownMs === undefined ? {} : { countdownMs: options.countdownMs }),
    ...(options.minPlayers === undefined ? {} : { minPlayers: options.minPlayers }),
    ...(options.maxPlayers === undefined ? {} : { maxPlayers: options.maxPlayers }),
    gameplaySnapshot() {
      return gameplay?.snapshot();
    }
  });
  const configured = createConfiguredAppHost({
    app: outpostAppDefinition,
    profile: createOutpostHeadlessServerProfile(context, {
      multiplayer: options.multiplayer,
      physicsBackend,
      clock,
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      createRuntime(runtimeContext) {
        gameplay = createOutpostAuthorityGameplayRuntime({
          ...runtimeContext,
          players: match.simulationPlayers
        });
        return gameplay.runtime;
      }
    }),
    context,
    clock
  });

  return {
    async boot() {
      await configured.host.boot();
    },
    async start() {
      await configured.host.start();
    },
    tick(frame: ColyseusRoomRuntimeFrame) {
      match.beginTick(frame.deltaMs);
      try {
        configured.host.tick(frame.deltaMs, frame.elapsedMs);
      } finally {
        void match.commitTick();
      }
    },
    async stop() {
      await configured.host.stop();
    },
    async dispose() {
      try {
        await configured.host.dispose();
      } finally {
        match.dispose();
      }
    },
    snapshot() {
      const hostPhase = configured.host.snapshot().phase;
      const authorityGameplay = hostPhase === "disposed" ? undefined : gameplay?.snapshot();
      return {
        hostPhase,
        running: context.game?.isRunning() ?? false,
        tick: authorityGameplay?.tick ?? context.game?.clock.snapshot().ticks ?? 0,
        entityCount: context.game?.world.count() ?? 0,
        physicsBound: authorityGameplay?.physics.bound ?? false,
        physicsBackend: physicsBackend.kind,
        match: match.snapshot()
      };
    }
  };
}
