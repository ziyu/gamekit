import type { Client as ColyseusClient, ClientOptions, Room as ColyseusRoom } from "@colyseus/sdk";
import type {
  MultiplayerAuthorityMode,
  MultiplayerChannel,
  MultiplayerPeerInput,
  MultiplayerSessionKind
} from "@gamekit/multiplayer-core";

export type ColyseusMessageType = string | number;

export type GameKitColyseusRoomJoinOptions = {
  sessionId?: string;
  roomId?: string;
  sessionKind?: MultiplayerSessionKind;
  authority?: MultiplayerAuthorityMode;
  localPeer?: MultiplayerPeerInput;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ColyseusMultiplayerBackendOptions = {
  id?: string;
  endpoint: string;
  roomName: string;
  client?: ColyseusClient;
  clientOptions?: ClientOptions;
  messageType?: ColyseusMessageType;
  presenceType?: ColyseusMessageType;
  sessionKind?: MultiplayerSessionKind;
  authority?: MultiplayerAuthorityMode;
  channels?: MultiplayerChannel[];
  maxPayloadBytes?: number;
  metadata?: Record<string, unknown>;
  createOptions?: Record<string, unknown>;
  joinOptions?: Record<string, unknown>;
  joinByIdFallback?: boolean;
};

export type ColyseusMultiplayerNative = {
  readonly client: ColyseusClient;
  readonly endpoint: string;
  readonly roomName: string;
  currentRoom(): ColyseusRoom | undefined;
};
