import type { Room, Server, ServerOptions } from "@colyseus/core";
import type { TransportOptions, WebSocketTransport } from "@colyseus/ws-transport";
import type { MultiplayerAuthorityMode, MultiplayerSessionKind } from "@gamekit/multiplayer-core";

import type {
  ColyseusMessageType,
  ColyseusNativeCapabilityInput,
  GameKitColyseusRoomJoinOptions
} from "../adapter";

export type GameKitColyseusRoomOptions = GameKitColyseusRoomJoinOptions & {
  messageType?: ColyseusMessageType;
  presenceType?: ColyseusMessageType;
  sessionKind?: MultiplayerSessionKind;
  authority?: MultiplayerAuthorityMode;
  maxPayloadBytes?: number;
  maxClients?: number;
  nativeCapabilities?: ColyseusNativeCapabilityInput;
  nativeStateSync?: {
    enabled?: boolean;
    messageType?: ColyseusMessageType;
    schemaVersion?: string;
    maxStateBytes?: number;
  };
};

export type ColyseusRoomClass = new () => Room;

export type GameKitColyseusRoomDefinition =
  | ColyseusRoomClass
  | {
      room: ColyseusRoomClass;
      options?: GameKitColyseusRoomOptions;
    };

export type CreateGameKitColyseusServerOptions = {
  host?: string;
  port?: number;
  roomName?: string;
  roomClass?: ColyseusRoomClass;
  roomOptions?: GameKitColyseusRoomOptions;
  rooms?: Record<string, GameKitColyseusRoomDefinition>;
  transportOptions?: TransportOptions;
  serverOptions?: Omit<ServerOptions, "transport">;
};

export type GameKitColyseusServerHandle = {
  readonly server: Server;
  readonly transport: WebSocketTransport;
  readonly host: string;
  readonly port: number;
  readonly endpoint: string;
  readonly roomNames: string[];
  dispose(): Promise<void>;
};
