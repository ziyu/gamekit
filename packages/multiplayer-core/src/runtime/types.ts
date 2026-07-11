export type MultiplayerPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "in-session"
  | "closed"
  | "disposed";

export type MultiplayerAuthorityMode =
  | "local"
  | "host-authoritative"
  | "server-authoritative"
  | "peer-cooperative"
  | "spectator";

export type MultiplayerAuthorityDecision =
  | { allowed: true; reason?: string }
  | { allowed: false; code: string; reason: string };

export type MultiplayerSessionStatus = "creating" | "open" | "starting" | "running" | "closed";

export type MultiplayerPeerStatus = "joining" | "connected" | "ready" | "disconnected" | "left";

export type MultiplayerPeerRole = "host" | "server" | "client" | "spectator" | string;

export type MultiplayerPeerInput = {
  id?: string;
  displayName?: string;
  role?: MultiplayerPeerRole;
  playerId?: string;
  metadata?: Record<string, unknown>;
};

export type MultiplayerPeer = {
  id: string;
  displayName?: string;
  role?: MultiplayerPeerRole;
  status: MultiplayerPeerStatus;
  playerId?: string;
  metadata?: Record<string, unknown>;
};

export type MultiplayerSessionKind = "local" | "private" | "public" | "matchmade" | string;

export type MultiplayerSession = {
  id: string;
  kind: MultiplayerSessionKind;
  authority: MultiplayerAuthorityMode;
  status: MultiplayerSessionStatus;
  peers: MultiplayerPeer[];
  metadata?: Record<string, unknown>;
};

export type CreateSessionRequest = {
  id?: string;
  kind?: MultiplayerSessionKind;
  authority?: MultiplayerAuthorityMode;
  localPeer?: MultiplayerPeerInput;
  metadata?: Record<string, unknown>;
};

export type JoinSessionRequest = {
  sessionId: string;
  localPeer?: MultiplayerPeerInput;
  metadata?: Record<string, unknown>;
};

export type ReconnectSessionRequest = {
  sessionId?: string;
  localPeer?: MultiplayerPeerInput;
  metadata?: Record<string, unknown>;
};

export type MultiplayerChannelId = string;
export type MultiplayerMessageKind = string;

export type MultiplayerChannel = {
  id: MultiplayerChannelId;
  reliability: "reliable" | "unreliable";
  ordering: "ordered" | "unordered";
  priority?: number;
  maxPayloadBytes?: number;
};

export type MultiplayerMessageEnvelope<TPayload = unknown> = {
  id: string;
  sessionId: string;
  channel: MultiplayerChannelId;
  kind: MultiplayerMessageKind;
  sourcePeerId: string;
  targetPeerIds?: string[];
  sequence?: number;
  tick?: number;
  schemaVersion?: string;
  correlationId?: string;
  timestamp: number;
  payload: TPayload;
};

export type MultiplayerOutgoingMessage<TPayload = unknown> = {
  id?: string;
  sessionId?: string;
  channel: MultiplayerChannelId;
  kind: MultiplayerMessageKind;
  targetPeerIds?: string[];
  sequence?: number;
  tick?: number;
  schemaVersion?: string;
  correlationId?: string;
  timestamp?: number;
  payload: TPayload;
};

export type MultiplayerMessageListener<TPayload = unknown> = (
  message: MultiplayerMessageEnvelope<TPayload>
) => void;

export type MultiplayerBackendListener = (message: MultiplayerMessageEnvelope) => void;

export type MultiplayerBackendCapabilities = {
  channels: MultiplayerChannel[];
  reconnect?: boolean;
  maxPayloadBytes?: number;
  metadata?: Record<string, unknown>;
};

export type MultiplayerBackendConnectContext = {
  runtimeId: string;
  localPeer?: MultiplayerPeerInput;
  clock?: () => number;
  metadata?: Record<string, unknown>;
};

export type MultiplayerBackendAdapter = {
  id: string;
  kind: string;
  capabilities: MultiplayerBackendCapabilities;
  connect(ctx: MultiplayerBackendConnectContext): Promise<MultiplayerBackendConnection>;
  native?(): unknown;
  snapshot(): MultiplayerBackendSnapshot;
};

export type MultiplayerBackendConnection = {
  createSession(request: CreateSessionRequest): Promise<MultiplayerSession>;
  joinSession(request: JoinSessionRequest): Promise<MultiplayerSession>;
  leaveSession(reason?: string): Promise<void>;
  send(message: MultiplayerMessageEnvelope): Promise<void>;
  subscribe(listener: MultiplayerBackendListener): () => void;
  close(reason?: string): Promise<void> | void;
  snapshot(): MultiplayerConnectionSnapshot;
};

export type MultiplayerBackendSnapshot = {
  id: string;
  kind: string;
  capabilities: MultiplayerBackendCapabilities;
  activeSessions?: number;
  activeConnections?: number;
  metadata?: Record<string, unknown>;
};

export type MultiplayerConnectionSnapshot = {
  phase: MultiplayerPhase;
  localPeer?: MultiplayerPeer;
  session?: MultiplayerSession;
  peers: MultiplayerPeer[];
  sent: number;
  received: number;
};

export type MultiplayerSnapshot = {
  id: string;
  backendId: string;
  phase: MultiplayerPhase;
  localPeer?: MultiplayerPeer;
  session?: MultiplayerSession;
  peers: MultiplayerPeer[];
  sent: number;
  received: number;
  backend: MultiplayerBackendSnapshot;
  connection?: MultiplayerConnectionSnapshot;
};

export type MultiplayerRuntime = {
  readonly id: string;
  readonly backendId: string;
  phase(): MultiplayerPhase;
  createSession(request?: CreateSessionRequest): Promise<MultiplayerSession>;
  joinSession(request: JoinSessionRequest): Promise<MultiplayerSession>;
  leaveSession(reason?: string): Promise<void>;
  reconnect?(request?: ReconnectSessionRequest): Promise<MultiplayerSession>;
  send<TPayload = unknown>(message: MultiplayerOutgoingMessage<TPayload>): Promise<void>;
  subscribe<TPayload = unknown>(listener: MultiplayerMessageListener<TPayload>): () => void;
  peers(): MultiplayerPeer[];
  localPeer(): MultiplayerPeer | undefined;
  session(): MultiplayerSession | undefined;
  snapshot(): MultiplayerSnapshot;
  dispose(): Promise<void>;
};

export type CreateMultiplayerRuntimeOptions = {
  id: string;
  backend: MultiplayerBackendAdapter;
  connectContext?: Omit<MultiplayerBackendConnectContext, "runtimeId">;
  clock?: () => number;
  idGenerator?: () => string;
};

export type MultiplayerReplicationContributor<TSnapshot = unknown, TPatch = unknown> = {
  id: string;
  version: string;
  order?: number;
  captureSnapshot(ctx: MultiplayerSnapshotContext): TSnapshot | undefined;
  capturePatch?(ctx: MultiplayerPatchContext): TPatch | undefined;
  applySnapshot?(snapshot: TSnapshot, ctx: MultiplayerApplyContext): void;
  applyPatch?(patch: TPatch, ctx: MultiplayerApplyContext): void;
};

export type MultiplayerSnapshotContext = {
  runtime: MultiplayerRuntime;
  tick?: number;
};

export type MultiplayerPatchContext = MultiplayerSnapshotContext & {
  sinceTick?: number;
};

export type MultiplayerApplyContext = {
  runtime: MultiplayerRuntime;
  sourcePeerId: string;
  tick?: number;
};
