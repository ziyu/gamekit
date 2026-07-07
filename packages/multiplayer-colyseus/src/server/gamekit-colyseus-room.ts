import { Room, type Client } from "@colyseus/core";
import {
  clonePeer,
  cloneSession,
  type MultiplayerMessageEnvelope,
  type MultiplayerPeer,
  type MultiplayerPeerInput,
  type MultiplayerSession
} from "@gamekit/multiplayer-core";

import {
  cloneEnvelope,
  estimatePayloadBytes,
  isMultiplayerMessageEnvelope
} from "../adapter/messages";
import { createColyseusNativeCapabilitySummary } from "../adapter/native-state";
import type { ColyseusMessageType } from "../adapter/types";
import type { GameKitColyseusRoomOptions } from "./types";

const HOST_AUTHORITY_LEFT_CLOSE_CODE = 4001;

type GameKitColyseusClient = Client<{
  userData: {
    peer?: MultiplayerPeer;
  };
}>;

export class GameKitColyseusRoom extends Room<{ client: GameKitColyseusClient }> {
  private messageType: ColyseusMessageType = "gamekit.message";
  private presenceType: ColyseusMessageType = "gamekit.presence";
  private gamekitSessionId: string | undefined;
  private sessionKind: MultiplayerSession["kind"] = "private";
  private authority: MultiplayerSession["authority"] = "server-authoritative";
  private sessionMetadata: Record<string, unknown> | undefined;
  private maxPayloadBytes = 32 * 1024;
  private peers = new Map<string, MultiplayerPeer>();
  private peerIdsBySessionId = new Map<string, string>();
  private invalidMessages = 0;

  onCreate(options: GameKitColyseusRoomOptions = {}): void {
    if (typeof options.roomId === "string" && options.roomId.length > 0) {
      this.roomId = options.roomId;
    }

    this.gamekitSessionId = options.sessionId;
    this.messageType = options.messageType ?? this.messageType;
    this.presenceType = options.presenceType ?? this.presenceType;
    this.sessionKind = options.sessionKind ?? this.sessionKind;
    this.authority = options.authority ?? this.authority;
    this.sessionMetadata = cloneRecord(options.metadata);
    this.maxPayloadBytes = options.maxPayloadBytes ?? this.maxPayloadBytes;
    this.maxClients = options.maxClients ?? this.maxClients;
    const nativeCapabilities = createColyseusNativeCapabilitySummary(options.nativeCapabilities);
    this.metadata = {
      gamekit: {
        kind: this.sessionKind,
        authority: this.authority,
        nativeCapabilities
      }
    };

    this.onMessage<MultiplayerMessageEnvelope>(this.messageType, (client, message) => {
      this.handleGameKitMessage(client as GameKitColyseusClient, message);
    });
  }

  onJoin(client: GameKitColyseusClient, options: GameKitColyseusRoomOptions = {}): void {
    const peer = toPeer(
      options.localPeer,
      client.sessionId,
      this.hasConnectedPeers() ? "client" : "host"
    );
    client.userData = { peer };
    this.peerIdsBySessionId.set(client.sessionId, peer.id);
    this.peers.set(peer.id, peer);
    this.broadcastPresence(peer, "connected");
  }

  onLeave(client: GameKitColyseusClient, code?: number): void {
    const peerId = this.peerIdsBySessionId.get(client.sessionId);
    const peer = (peerId ? this.peers.get(peerId) : undefined) ?? client.userData?.peer;
    if (!peer) {
      return;
    }

    const leftPeer: MultiplayerPeer = {
      ...peer,
      status: "left"
    };
    this.peerIdsBySessionId.delete(client.sessionId);
    this.peers.set(leftPeer.id, leftPeer);
    client.userData = { peer: leftPeer };
    this.broadcastPresence(leftPeer, "left", code === undefined ? undefined : String(code));

    if (this.authority === "host-authoritative" && leftPeer.role === "host") {
      void this.disconnect(code ?? HOST_AUTHORITY_LEFT_CLOSE_CODE);
    }
  }

  snapshot(): MultiplayerSession {
    return this.createSessionSummary();
  }

  diagnostics(): { invalidMessages: number; peers: MultiplayerPeer[] } {
    return {
      invalidMessages: this.invalidMessages,
      peers: [...this.peers.values()].map(clonePeer)
    };
  }

  private get sessionId(): string {
    return this.gamekitSessionId ?? this.roomId;
  }

  private handleGameKitMessage(
    client: GameKitColyseusClient,
    message: MultiplayerMessageEnvelope
  ): void {
    const peer = client.userData?.peer;
    if (!peer || !isMultiplayerMessageEnvelope(message)) {
      this.invalidMessages += 1;
      return;
    }

    if (message.sessionId !== this.sessionId || message.sourcePeerId !== peer.id) {
      this.invalidMessages += 1;
      return;
    }

    try {
      if (estimatePayloadBytes(message) > this.maxPayloadBytes) {
        this.invalidMessages += 1;
        return;
      }
    } catch {
      this.invalidMessages += 1;
      return;
    }

    const targets = this.resolveTargets(message);
    const outbound = cloneEnvelope(message);
    for (const target of targets) {
      target.send(this.messageType, outbound);
    }
  }

  private resolveTargets(message: MultiplayerMessageEnvelope): GameKitColyseusClient[] {
    if (!message.targetPeerIds) {
      return [...this.clients] as GameKitColyseusClient[];
    }

    const targetPeerIds = new Set(message.targetPeerIds);
    return (this.clients as GameKitColyseusClient[]).filter((client) => {
      const peerId = this.peerIdsBySessionId.get(client.sessionId);
      return peerId ? targetPeerIds.has(peerId) : false;
    });
  }

  private broadcastPresence(peer: MultiplayerPeer, status: "connected" | "left", reason?: string) {
    const session = this.createSessionSummary();
    const message: MultiplayerMessageEnvelope = {
      id: `${this.sessionId}.presence.${peer.id}.${status}.${Date.now()}`,
      sessionId: this.sessionId,
      channel: "reliable",
      kind: "peer.presence",
      sourcePeerId: peer.id,
      timestamp: Date.now(),
      payload: {
        peer: clonePeer(peer),
        status,
        session: cloneSession(session),
        ...(reason === undefined ? {} : { reason })
      }
    };
    this.broadcast(this.presenceType, message);
  }

  private createSessionSummary(): MultiplayerSession {
    return {
      id: this.sessionId,
      kind: this.sessionKind,
      authority: this.authority,
      status: "open",
      peers: [...this.peers.values()].map(clonePeer),
      ...(this.sessionMetadata ? { metadata: { ...this.sessionMetadata } } : {})
    };
  }

  private hasConnectedPeers(): boolean {
    for (const peer of this.peers.values()) {
      if (peer.status === "connected" || peer.status === "ready") {
        return true;
      }
    }

    return false;
  }
}

function toPeer(
  input: MultiplayerPeerInput | undefined,
  fallbackId: string,
  fallbackRole: string
): MultiplayerPeer {
  return {
    id: input?.id ?? fallbackId,
    ...(input?.displayName === undefined ? {} : { displayName: input.displayName }),
    role: input?.role ?? fallbackRole,
    status: "connected",
    ...(input?.playerId === undefined ? {} : { playerId: input.playerId }),
    ...(input?.metadata ? { metadata: { ...input.metadata } } : {})
  };
}

function cloneRecord(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  return value ? { ...value } : undefined;
}
