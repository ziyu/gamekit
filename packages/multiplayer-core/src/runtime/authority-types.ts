import type {
  MultiplayerAuthorityDecision,
  MultiplayerAuthorityMode,
  MultiplayerMessageEnvelope,
  MultiplayerRuntime
} from "./types";

export const MULTIPLAYER_AUTHORITY_CHANNEL = "reliable";
export const MULTIPLAYER_ACTION_KIND = "game.action";
export const MULTIPLAYER_INPUT_KIND = "game.input";
export const MULTIPLAYER_SNAPSHOT_KIND = "game.snapshot";
export const MULTIPLAYER_PATCH_KIND = "game.patch";
export const MULTIPLAYER_RESULT_KIND = "game.result";

export type MultiplayerAuthorityBindingStatus =
  | "unbound"
  | "binding"
  | "bound"
  | "resyncing"
  | "rejected"
  | "closed";

export type MultiplayerAuthorityEndpointKind = "local" | "peer" | "server";

export type MultiplayerAuthorityEndpoint = {
  kind: MultiplayerAuthorityEndpointKind;
  id: string;
  peerId?: string;
};

export type MultiplayerAuthorityBinding = {
  sessionId: string;
  mode: MultiplayerAuthorityMode;
  status: MultiplayerAuthorityBindingStatus;
  authorityEndpoint?: MultiplayerAuthorityEndpoint;
  authorityPeerId?: string;
  localPlayerId?: string;
  tick?: number;
  snapshotVersion?: string;
  reason?: string;
};

export type MultiplayerAuthorityBindingInput = {
  sessionId: string;
  mode: MultiplayerAuthorityMode;
  status?: MultiplayerAuthorityBindingStatus;
  authorityEndpoint?: MultiplayerAuthorityEndpoint;
  authorityPeerId?: string;
  localPlayerId?: string;
  tick?: number;
  snapshotVersion?: string;
  reason?: string;
};

export type MultiplayerAuthorityBindingUpdate = {
  sessionId?: string;
  mode?: MultiplayerAuthorityMode;
  status?: MultiplayerAuthorityBindingStatus;
  authorityEndpoint?: MultiplayerAuthorityEndpoint;
  authorityPeerId?: string;
  localPlayerId?: string;
  tick?: number;
  snapshotVersion?: string;
  reason?: string;
};

export type MultiplayerAuthorityBindingStore = {
  current(): MultiplayerAuthorityBinding;
  bind(input: MultiplayerAuthorityBindingInput): MultiplayerAuthorityBinding;
  update(update: MultiplayerAuthorityBindingUpdate): MultiplayerAuthorityBinding;
  reject(reason: string): MultiplayerAuthorityBinding;
  close(reason?: string): MultiplayerAuthorityBinding;
  acceptsMessage(message: MultiplayerMessageEnvelope): MultiplayerAuthorityDecision;
};

export type MultiplayerAuthorityRejectedPayload = {
  code: string;
  reason: string;
  messageId?: string;
  sourcePeerId?: string;
  kind?: string;
};

export type MultiplayerAuthorityMessageContext<TPayload> = {
  runtime: MultiplayerRuntime;
  message: MultiplayerMessageEnvelope;
  payload: TPayload;
  binding: MultiplayerAuthorityBinding;
};

export type MultiplayerAuthorityTickContext = {
  tick: number;
  deltaMs: number;
  binding: MultiplayerAuthorityBinding;
};

export type MultiplayerAuthoritySnapshotContext = {
  tick: number;
  binding: MultiplayerAuthorityBinding;
};

export type MultiplayerAuthorityApplyContext = {
  tick?: number;
  sourcePeerId: string;
  binding: MultiplayerAuthorityBinding;
  message: MultiplayerMessageEnvelope;
};

export type MultiplayerAuthorityLocalContext<TPayload> = {
  payload: TPayload;
  binding: MultiplayerAuthorityBinding;
  tick: number;
};
