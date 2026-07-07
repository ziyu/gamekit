import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityHostLoop,
  type MultiplayerAuthorityDecision,
  type MultiplayerMessageEnvelope,
  type MultiplayerPeer,
  type MultiplayerRuntime
} from "@gamekit/multiplayer-core";
import { createRealtimePracticeArenaState, REALTIME_ARENA_TICK_MS } from "./config";
import {
  applyRealtimeInputFrame,
  captureRealtimeArenaSnapshot,
  joinRealtimeArenaPlayer,
  rematchRealtimeArena,
  removeRealtimeArenaPlayer,
  setRealtimeArenaPlayerReady,
  startRealtimeArenaCountdown,
  tickRealtimeArena,
  type RealtimeArenaActionResult,
  type RealtimeArenaState,
  type RealtimeInputFrame
} from "./domain";
import {
  isRealtimeArenaNetworkAction,
  readRealtimeArenaInputPayload,
  REALTIME_ARENA_ACTION_KIND,
  REALTIME_ARENA_CHANNEL,
  REALTIME_ARENA_INPUT_KIND,
  REALTIME_ARENA_SNAPSHOT_KIND,
  type RealtimeArenaNetworkAction,
  type RealtimeArenaSnapshotPayload
} from "./protocol";

export type RealtimeArenaHost = {
  readonly state: RealtimeArenaState;
  snapshot(): RealtimeArenaSnapshotPayload;
  diagnostics(): RealtimeArenaHostDiagnostics;
  tick(delta?: number): void;
  dispose(): void;
};

export type RealtimeArenaHostDiagnostics = {
  sentSnapshots: number;
  rejectedMessages: number;
  lastAction?: RealtimeArenaActionResult;
  lastBroadcastError?: string;
};

export type RealtimeArenaHostOptions = {
  runtime: MultiplayerRuntime;
  sessionId: string;
  hostPeerId: string;
  clock?: () => number;
};

type PresencePayload = {
  peer: MultiplayerPeer;
  status: "connected" | "left";
};

export function createRealtimeArenaHost(options: RealtimeArenaHostOptions): RealtimeArenaHost {
  const clock = options.clock ?? (() => Date.now());
  const connectedPeers = new Map<string, MultiplayerPeer>();
  const playerIdsByPeerId = new Map<string, string>();
  const diagnostics: RealtimeArenaHostDiagnostics = {
    sentSnapshots: 0,
    rejectedMessages: 0
  };
  let state = createRealtimePracticeArenaState();
  const authorityBinding = createMultiplayerAuthorityBindingStore({
    sessionId: options.sessionId,
    mode: "host-authoritative",
    authorityPeerId: options.hostPeerId,
    authorityEndpoint: {
      kind: "peer",
      id: options.hostPeerId,
      peerId: options.hostPeerId
    }
  });
  const authorityLoop = createMultiplayerAuthorityHostLoop<
    RealtimeArenaNetworkAction,
    RealtimeInputFrame,
    RealtimeArenaSnapshotPayload
  >({
    runtime: options.runtime,
    binding: authorityBinding,
    channel: REALTIME_ARENA_CHANNEL,
    actionKind: REALTIME_ARENA_ACTION_KIND,
    inputKind: REALTIME_ARENA_INPUT_KIND,
    snapshotKind: REALTIME_ARENA_SNAPSHOT_KIND,
    readAction(payload) {
      return isRealtimeArenaNetworkAction(payload) ? payload : undefined;
    },
    readInput(payload) {
      return readRealtimeArenaInputPayload(payload)?.frame;
    },
    inputSequence(input) {
      return input.sequence;
    },
    handleAction({ message, payload }) {
      return toAuthorityDecision(handleActionFromPeer(message.sourcePeerId, payload));
    },
    handleInput({ message, payload }) {
      return toAuthorityDecision(handleInputFromPeer(message.sourcePeerId, payload));
    },
    tick({ deltaMs }) {
      reconcilePeers();
      tickRealtimeArena(state, deltaMs);
    },
    captureSnapshot() {
      return createSnapshotPayload();
    },
    onRejected(rejection) {
      diagnostics.lastAction = {
        accepted: false,
        code: rejection.code,
        reason: rejection.reason
      };
    }
  });

  const unsubscribe = options.runtime.subscribe((message) => {
    handleMessage(message);
  });

  function handleMessage(message: MultiplayerMessageEnvelope): void {
    if (message.kind === "peer.presence") {
      handlePresenceMessage(message.payload);
      void authorityLoop.broadcastSnapshot();
    }
  }

  function handlePresenceMessage(payload: unknown): void {
    const presence = readPresencePayload(payload);
    if (!presence || presence.peer.id === options.hostPeerId) {
      return;
    }

    if (presence.status === "left") {
      markPeerLeft(presence.peer.id);
      return;
    }

    ensurePlayerForPeer(presence.peer);
  }

  function handleActionFromPeer(
    peerId: string,
    action: RealtimeArenaNetworkAction
  ): RealtimeArenaActionResult {
    const playerId = ensurePlayerForPeer(
      connectedPeers.get(peerId) ?? {
        id: peerId,
        role: "client",
        status: "connected"
      }
    );
    if (!playerId) {
      diagnostics.lastAction = {
        accepted: false,
        code: "unknown-player",
        reason: `No realtime arena player is mapped to peer: ${peerId}`
      };
      return diagnostics.lastAction;
    }

    switch (action.type) {
      case "ready":
        diagnostics.lastAction = setRealtimeArenaPlayerReady(state, playerId, action.ready);
        break;
      case "start":
        if (state.phase === "lobby") {
          setRealtimeArenaPlayerReady(state, playerId, true);
        }
        diagnostics.lastAction = startRealtimeArenaCountdown(state);
        break;
      case "rematch":
        diagnostics.lastAction = rematchRealtimeArena(state);
        break;
      case "reset":
        resetArena();
        diagnostics.lastAction = { accepted: true };
        break;
    }

    return diagnostics.lastAction;
  }

  function handleInputFromPeer(
    peerId: string,
    input: RealtimeInputFrame
  ): RealtimeArenaActionResult {
    const playerId = playerIdsByPeerId.get(peerId);
    if (!playerId) {
      diagnostics.lastAction = {
        accepted: false,
        code: "unknown-player",
        reason: `No realtime arena player is mapped to peer: ${peerId}`
      };
      return diagnostics.lastAction;
    }

    diagnostics.lastAction = applyRealtimeInputFrame(state, playerId, input);
    return diagnostics.lastAction;
  }

  function ensurePlayerForPeer(peer: MultiplayerPeer): string | undefined {
    if (peer.id === options.hostPeerId || peer.role === "host" || peer.role === "server") {
      return undefined;
    }

    connectedPeers.set(peer.id, clonePeer(peer, "connected"));
    const mappedPlayerId = playerIdsByPeerId.get(peer.id);
    const mappedPlayer =
      mappedPlayerId === undefined
        ? undefined
        : state.players.find((player) => player.id === mappedPlayerId);
    if (mappedPlayer) {
      mappedPlayer.connected = true;
      mappedPlayer.label = peer.displayName ?? mappedPlayer.label;
      return mappedPlayer.id;
    }

    const directPlayer = state.players.find((player) => player.id === peer.id);
    if (directPlayer) {
      directPlayer.connected = true;
      directPlayer.label = peer.displayName ?? directPlayer.label;
      playerIdsByPeerId.set(peer.id, directPlayer.id);
      return directPlayer.id;
    }

    if (state.phase !== "lobby") {
      return undefined;
    }

    const playerId = peer.playerId ?? peer.id;
    const result = joinRealtimeArenaPlayer(state, {
      id: playerId,
      label: peer.displayName ?? playerId
    });
    diagnostics.lastAction = result;
    if (!result.accepted) {
      return undefined;
    }

    playerIdsByPeerId.set(peer.id, playerId);
    return playerId;
  }

  function markPeerLeft(peerId: string): void {
    const current = connectedPeers.get(peerId);
    if (current) {
      connectedPeers.set(peerId, clonePeer(current, "left"));
    }

    const playerId = playerIdsByPeerId.get(peerId);
    if (playerId !== undefined) {
      diagnostics.lastAction = removeRealtimeArenaPlayer(state, playerId);
      playerIdsByPeerId.delete(peerId);
    }
  }

  function reconcilePeers(): void {
    for (const peer of options.runtime.peers()) {
      if (peer.id === options.hostPeerId) {
        continue;
      }

      if (isActivePeer(peer)) {
        ensurePlayerForPeer(peer);
      } else if (peer.status === "left" || peer.status === "disconnected") {
        markPeerLeft(peer.id);
      }
    }
  }

  function resetArena(): void {
    const activePeers = [...connectedPeers.values()].filter(isActivePeer);
    state = createRealtimePracticeArenaState();
    playerIdsByPeerId.clear();
    for (const peer of activePeers) {
      ensurePlayerForPeer(peer);
    }
  }

  function createSnapshotPayload(): RealtimeArenaSnapshotPayload {
    return {
      snapshot: captureRealtimeArenaSnapshot(state),
      playersByPeerId: Object.fromEntries(playerIdsByPeerId.entries()),
      serverTime: clock()
    };
  }

  return {
    get state() {
      return state;
    },
    snapshot() {
      return createSnapshotPayload();
    },
    diagnostics() {
      const authorityDiagnostics = authorityLoop.diagnostics();
      return {
        ...diagnostics,
        sentSnapshots: authorityDiagnostics.sentSnapshots,
        rejectedMessages: authorityDiagnostics.rejectedMessages,
        ...(authorityDiagnostics.lastBroadcastError === undefined
          ? {}
          : { lastBroadcastError: authorityDiagnostics.lastBroadcastError })
      };
    },
    tick(delta = REALTIME_ARENA_TICK_MS) {
      authorityLoop.tick(delta);
    },
    dispose() {
      unsubscribe();
      authorityLoop.dispose();
    }
  };
}

function toAuthorityDecision(result: RealtimeArenaActionResult): MultiplayerAuthorityDecision {
  return result.accepted
    ? { allowed: true }
    : { allowed: false, code: result.code, reason: result.reason };
}

function readPresencePayload(value: unknown): PresencePayload | undefined {
  if (!isRecord(value) || !isRecord(value.peer)) {
    return undefined;
  }
  if (value.status !== "connected" && value.status !== "left") {
    return undefined;
  }
  if (typeof value.peer.id !== "string") {
    return undefined;
  }

  const peer: MultiplayerPeer = {
    id: value.peer.id,
    ...(typeof value.peer.displayName === "string" ? { displayName: value.peer.displayName } : {}),
    ...(typeof value.peer.role === "string" ? { role: value.peer.role } : {}),
    status: value.status === "connected" ? "connected" : "left",
    ...(typeof value.peer.playerId === "string" ? { playerId: value.peer.playerId } : {})
  };
  return {
    peer,
    status: value.status
  };
}

function isActivePeer(peer: MultiplayerPeer): boolean {
  return peer.status === "joining" || peer.status === "connected" || peer.status === "ready";
}

function clonePeer(peer: MultiplayerPeer, status: MultiplayerPeer["status"]): MultiplayerPeer {
  return {
    id: peer.id,
    ...(peer.displayName === undefined ? {} : { displayName: peer.displayName }),
    ...(peer.role === undefined ? {} : { role: peer.role }),
    status,
    ...(peer.playerId === undefined ? {} : { playerId: peer.playerId }),
    ...(peer.metadata === undefined ? {} : { metadata: { ...peer.metadata } })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
