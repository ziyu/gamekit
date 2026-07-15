import { Room, type Client } from "@colyseus/core";
import {
  createColyseusNativeCapabilitySummary,
  type GameKitColyseusRoomJoinOptions
} from "@gamekit/multiplayer-colyseus";
import {
  createColyseusRoomRuntimeBridge,
  type ColyseusRoomRuntimeBridge,
  type ColyseusRoomRuntimeBridgeSnapshot
} from "@gamekit/multiplayer-colyseus/server";
import type { MultiplayerPeerInput } from "@gamekit/multiplayer-core";
import type { PhysicsBackendAdapter } from "@gamekit/physics-core";

import {
  createOutpostRoomAuthorityRuntime,
  type OutpostRoomAuthorityRuntimeSnapshot
} from "./outpost-room-authority-runtime";

const OUTPOST_MESSAGE_TYPE = "gamekit.message";

export type OutpostSiegeRoomCreateOptions = GameKitColyseusRoomJoinOptions & {
  seed?: string;
};

export type OutpostSiegeRoomRuntimeOptions = {
  fixedStepMs?: number;
  maxPayloadBytes?: number;
  maxClients?: number;
  countdownMs?: number;
  minPlayers?: number;
  maxPlayers?: number;
  physicsBackend?: PhysicsBackendAdapter;
  clock?: () => number;
  onRoomCreated?(room: OutpostSiegeRoom): void;
};

type OutpostRoomBridge = ColyseusRoomRuntimeBridge<
  OutpostSiegeRoom,
  Client,
  OutpostSiegeRoomCreateOptions,
  OutpostRoomAuthorityRuntimeSnapshot
>;

export class OutpostSiegeRoom extends Room {
  private authorityBridge: OutpostRoomBridge | undefined;
  private unbindMessage: (() => void) | undefined;

  protected runtimeOptions(): OutpostSiegeRoomRuntimeOptions {
    return {};
  }

  async onCreate(options: OutpostSiegeRoomCreateOptions = {}): Promise<void> {
    const runtimeOptions = this.runtimeOptions();
    if (typeof options.roomId === "string" && options.roomId.length > 0) {
      this.roomId = options.roomId;
    }

    this.maxClients = runtimeOptions.maxClients ?? runtimeOptions.maxPlayers ?? 4;
    this.metadata = {
      gamekit: {
        kind: options.sessionKind ?? "private",
        authority: "server-authoritative",
        nativeCapabilities: createColyseusNativeCapabilitySummary({
          authoritativePath: "gamekit-envelope"
        })
      }
    };

    const bridge = createColyseusRoomRuntimeBridge<
      OutpostSiegeRoom,
      Client,
      OutpostSiegeRoomCreateOptions,
      OutpostRoomAuthorityRuntimeSnapshot
    >({
      id: `outpost.room.${this.roomId}`,
      ...(runtimeOptions.fixedStepMs === undefined
        ? {}
        : { fixedStepMs: runtimeOptions.fixedStepMs }),
      ...(runtimeOptions.maxPayloadBytes === undefined
        ? {}
        : { maxPayloadBytes: runtimeOptions.maxPayloadBytes }),
      ...(runtimeOptions.clock === undefined ? {} : { clock: runtimeOptions.clock }),
      messageType: OUTPOST_MESSAGE_TYPE,
      sessionKind: options.sessionKind ?? "private",
      serverPeer: {
        id: `${options.sessionId ?? this.roomId}.server`,
        displayName: "Outpost Authority",
        role: "server"
      },
      resolveSessionId(room, createOptions) {
        return createOptions.sessionId ?? room.roomId;
      },
      createRuntime({ multiplayer, sessionId, options: createOptions }) {
        return createOutpostRoomAuthorityRuntime({
          multiplayer,
          ...(runtimeOptions.physicsBackend === undefined
            ? {}
            : { physicsBackend: runtimeOptions.physicsBackend }),
          ...(runtimeOptions.clock === undefined ? {} : { clock: runtimeOptions.clock }),
          ...(runtimeOptions.countdownMs === undefined
            ? {}
            : { countdownMs: runtimeOptions.countdownMs }),
          ...(runtimeOptions.minPlayers === undefined
            ? {}
            : { minPlayers: runtimeOptions.minPlayers }),
          ...(runtimeOptions.maxPlayers === undefined
            ? {}
            : { maxPlayers: runtimeOptions.maxPlayers }),
          seed: createOptions.seed ?? `outpost.room.${sessionId}`
        });
      }
    });
    this.authorityBridge = bridge;
    await bridge.create(this, options);
    this.unbindMessage = this.onMessage(OUTPOST_MESSAGE_TYPE, (client, message) => {
      bridge.receive(client, message);
    });
    runtimeOptions.onRoomCreated?.(this);
  }

  onJoin(client: Client, options: OutpostSiegeRoomCreateOptions = {}): void {
    this.requireAuthorityBridge().join(client, toOutpostPeer(client, options.localPeer));
  }

  onLeave(client: Client, code?: number): void {
    this.authorityBridge?.leave(client, code);
  }

  async onDispose(): Promise<void> {
    this.unbindMessage?.();
    this.unbindMessage = undefined;
    await this.authorityBridge?.dispose();
  }

  authoritySnapshot(): ColyseusRoomRuntimeBridgeSnapshot<OutpostRoomAuthorityRuntimeSnapshot> {
    return this.requireAuthorityBridge().snapshot();
  }

  private requireAuthorityBridge(): OutpostRoomBridge {
    if (!this.authorityBridge) {
      throw new Error("Outpost Siege Room authority bridge has not been created.");
    }
    return this.authorityBridge;
  }
}

export type OutpostSiegeRoomClass = new () => OutpostSiegeRoom;

export function createOutpostSiegeRoomClass(
  options: OutpostSiegeRoomRuntimeOptions = {}
): OutpostSiegeRoomClass {
  return class ConfiguredOutpostSiegeRoom extends OutpostSiegeRoom {
    protected override runtimeOptions(): OutpostSiegeRoomRuntimeOptions {
      return options;
    }
  };
}

function toOutpostPeer(
  client: Client,
  input: MultiplayerPeerInput | undefined
): MultiplayerPeerInput {
  return {
    id: input?.id ?? client.sessionId,
    ...(input?.displayName === undefined ? {} : { displayName: input.displayName }),
    role: input?.role === "host" ? "party-leader" : (input?.role ?? "client"),
    ...(input?.playerId === undefined ? {} : { playerId: input.playerId }),
    ...(input?.metadata ? { metadata: { ...input.metadata } } : {})
  };
}
