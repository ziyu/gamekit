import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";
import { describe, expect, it } from "vitest";
import { createMultiplayerDemoClient, type MultiplayerDemoClient } from "../client";
import type { LocalMultiplayerDemoHost } from "./create-local-demo-server";
import { MULTIPLAYER_DEMO_ROOM_NAME } from "./create-local-demo-server";
import {
  createMultiplayerDemoSessionRegistry,
  MultiplayerDemoSessionConflictError
} from "./session-registry";
import { waitFor } from "../test/harness";

describe("multiplayer-demo session registry e2e", () => {
  it("keeps ordinary client leave scoped to the client connection", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: uniqueRoomName("client-leave")
    });
    const registry = createMultiplayerDemoSessionRegistry({
      endpoint: colyseus.endpoint,
      roomName: readRoomName(colyseus.roomNames)
    });
    const host = (await registry.hostSession("client-leave-session", "owner-a")).session;
    const clientA = createClient(host, "client-a");
    const clientB = createClient(host, "client-b");

    try {
      await clientA.connect();
      await waitFor(() => countActivePeers(host) === 2);

      await clientA.dispose();
      await waitFor(() => countActivePeers(host) === 1);

      expect(registry.getSession(host.sessionId)).toBe(host);
      await clientB.connect();
      await waitFor(() => countActivePeers(host) === 2);
      expect(host.realtime.snapshot().playersByPeerId["client-a"]).toBeUndefined();
    } finally {
      await clientB.dispose();
      await clientA.dispose();
      await registry.dispose();
      await colyseus.dispose();
    }
  });

  it("closes the hosted session and rejects late clients when the host closes", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: uniqueRoomName("host-close")
    });
    const registry = createMultiplayerDemoSessionRegistry({
      endpoint: colyseus.endpoint,
      roomName: readRoomName(colyseus.roomNames)
    });
    const host = (await registry.hostSession("host-close-session", "owner-a")).session;
    const client = createClient(host, "client-a");
    const lateClient = createClient(host, "late-client");

    try {
      await client.connect();
      await waitFor(() => countActivePeers(host) === 2);

      expect(await registry.closeSession(host.sessionId)).toBe(true);
      await waitFor(() => client.runtime.phase() !== "in-session");

      expect(registry.getSession(host.sessionId)).toBeUndefined();
      expect(client.runtime.snapshot().session).toBeUndefined();
      await expect(lateClient.connect()).rejects.toBeTruthy();
      expect(await registry.closeSession(host.sessionId)).toBe(false);
    } finally {
      await lateClient.dispose();
      await client.dispose();
      await registry.dispose();
      await colyseus.dispose();
    }
  });

  it("recreates the same selected session with a fresh host after close", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: uniqueRoomName("recreate")
    });
    const registry = createMultiplayerDemoSessionRegistry({
      endpoint: colyseus.endpoint,
      roomName: readRoomName(colyseus.roomNames)
    });
    const sessionId = "recreate-session";
    const firstHost = (await registry.hostSession(sessionId, "owner-a")).session;
    let client: MultiplayerDemoClient | undefined;

    try {
      expect(await registry.closeSession(sessionId)).toBe(true);

      const secondHost = (await registry.hostSession(sessionId, "owner-b")).session;
      client = createClient(secondHost, "client-after-recreate");
      await client.connect();
      await waitFor(() => countActivePeers(secondHost) === 2);

      expect(secondHost).not.toBe(firstHost);
      expect(registry.sessionIds()).toEqual([sessionId]);
      expect(
        secondHost.host
          .peers()
          .map((peer) => peer.id)
          .sort()
      ).toEqual(["client-after-recreate", secondHost.hostPeerId]);
    } finally {
      await client?.dispose();
      await registry.dispose();
      await colyseus.dispose();
    }
  });

  it("rejects a second host owner for an already hosted selected session", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: uniqueRoomName("owner-conflict")
    });
    const registry = createMultiplayerDemoSessionRegistry({
      endpoint: colyseus.endpoint,
      roomName: readRoomName(colyseus.roomNames)
    });
    const sessionId = "owner-conflict-session";

    try {
      const hosted = await registry.hostSession(sessionId, "owner-a");
      const sameOwner = await registry.hostSession(sessionId, "owner-a");

      expect(hosted.created).toBe(true);
      expect(sameOwner.created).toBe(false);
      expect(sameOwner.session).toBe(hosted.session);
      await expect(registry.hostSession(sessionId, "owner-b")).rejects.toBeInstanceOf(
        MultiplayerDemoSessionConflictError
      );
      expect(registry.getHostOwnerId(sessionId)).toBe("owner-a");
      expect(registry.sessionIds()).toEqual([sessionId]);
    } finally {
      await registry.dispose();
      await colyseus.dispose();
    }
  });
});

function createClient(host: LocalMultiplayerDemoHost, peerId: string): MultiplayerDemoClient {
  return createMultiplayerDemoClient({
    endpoint: host.endpoint,
    roomName: host.roomName,
    sessionId: host.sessionId,
    hostPeerId: host.hostPeerId,
    peerId,
    displayName: peerId
  });
}

function countActivePeers(host: LocalMultiplayerDemoHost): number {
  return host.host
    .peers()
    .filter(
      (peer) => peer.status === "joining" || peer.status === "connected" || peer.status === "ready"
    ).length;
}

function readRoomName(roomNames: string[]): string {
  return roomNames[0] ?? MULTIPLAYER_DEMO_ROOM_NAME;
}

function uniqueRoomName(scope: string): string {
  return `${MULTIPLAYER_DEMO_ROOM_NAME}_${scope}_${Date.now()}_${Math.floor(
    Math.random() * 10000
  )}`;
}
