import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";
import { describe, expect, it } from "vitest";
import { createMultiplayerDemoClient, type MultiplayerDemoClient } from "./client";
import type { LocalMultiplayerDemoHost } from "./server/create-local-demo-server";
import {
  createLocalMultiplayerDemoHost,
  MULTIPLAYER_DEMO_ROOM_NAME
} from "./server/create-local-demo-server";
import { createMultiplayerDemoTestHarness, waitFor } from "./test/harness";

describe("multiplayer-demo", () => {
  it("applies a Colyseus client command on the host tick boundary", async () => {
    const harness = await createMultiplayerDemoTestHarness();

    try {
      await harness.connectClient();
      const before = harness.server.app.snapshot();
      await harness.sendClientCommand({ type: "confirm", objectId: "relay-alpha" });
      await harness.waitForHostCommand();

      expect(harness.server.app.snapshot().state.confirmations).toBe(before.state.confirmations);

      harness.tickHost();

      expect(harness.server.app.snapshot().state.confirmations).toBe(
        before.state.confirmations + 1
      );
      expect(
        harness.server.app.events.some((event) => event.type === "multiplayer.command.accepted")
      ).toBe(true);

      await waitFor(() =>
        harness.client.messages.some((message) => message.kind === "game.command.result")
      );
      expect(
        harness.client.messages.some(
          (message) =>
            message.kind === "game.command.result" && message.sourcePeerId === "demo-host"
        )
      ).toBe(true);
    } finally {
      await harness.dispose();
    }
  });

  it("rejects invalid client priority without mutating demo state", async () => {
    const harness = await createMultiplayerDemoTestHarness();

    try {
      await harness.connectClient();
      const before = harness.server.app.snapshot();
      await harness.sendClientCommand({
        type: "set-priority",
        objectId: "relay-alpha",
        priority: 99
      });
      await harness.waitForHostCommand();
      harness.tickHost();
      const after = harness.server.app.snapshot();
      const relay = after.state.objects.find((object) => object.id === "relay-alpha");

      expect(relay?.priority).toBe(
        before.state.objects.find((object) => object.id === "relay-alpha")?.priority
      );
      expect(after.state.rejectedCommands).toBe(before.state.rejectedCommands + 1);
      expect(
        harness.server.app.events.some((event) => event.type === "multiplayer.command.rejected")
      ).toBe(true);
    } finally {
      await harness.dispose();
    }
  });

  it("stops applying commands after the host runtime is disposed", async () => {
    const harness = await createMultiplayerDemoTestHarness();

    try {
      await harness.connectClient();
      await harness.server.disposeHost();
      const before = harness.server.app.snapshot();

      await harness.sendClientCommand({ type: "confirm", objectId: "relay-alpha" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      harness.tickHost();

      expect(harness.server.app.snapshot().state.confirmations).toBe(before.state.confirmations);
    } finally {
      await harness.dispose();
    }
  });

  it("rejects client connection to an unhosted selected room", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: `${MULTIPLAYER_DEMO_ROOM_NAME}_unhosted_${Date.now()}_${Math.floor(
        Math.random() * 10000
      )}`
    });
    const client = createMultiplayerDemoClient({
      endpoint: colyseus.endpoint,
      roomName: colyseus.roomNames[0] ?? MULTIPLAYER_DEMO_ROOM_NAME,
      sessionId: "unhosted-room",
      hostPeerId: "demo-host",
      peerId: "unhosted-client",
      displayName: "unhosted-client"
    });

    try {
      await expect(client.connect()).rejects.toBeTruthy();
    } finally {
      await client.dispose();
      await colyseus.dispose();
    }
  });

  it("connects multiple clients to the selected room without counting left peers as active", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: `${MULTIPLAYER_DEMO_ROOM_NAME}_selected_${Date.now()}_${Math.floor(
        Math.random() * 10000
      )}`
    });
    const host = await createLocalMultiplayerDemoHost({
      endpoint: colyseus.endpoint,
      roomName: colyseus.roomNames[0] ?? MULTIPLAYER_DEMO_ROOM_NAME,
      sessionId: "selected-room"
    });
    const clientA = createClient(host, "client-a");
    const clientB = createClient(host, "client-b");

    try {
      await clientA.connect();
      await clientB.connect();
      await waitFor(() => countActivePeers(host) === 3);

      expect(countActivePeers(host)).toBe(3);

      await clientA.dispose();
      await waitFor(() => countActivePeers(host) === 2);

      expect(countActivePeers(host)).toBe(2);
      expect(
        host.host.peers().some((peer) => peer.id === "client-a" && peer.status === "left")
      ).toBe(true);
    } finally {
      await clientA.dispose();
      await clientB.dispose();
      await host.dispose();
      await colyseus.dispose();
    }
  });

  it("keeps specified rooms isolated on one Colyseus server", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: `${MULTIPLAYER_DEMO_ROOM_NAME}_isolated_${Date.now()}_${Math.floor(
        Math.random() * 10000
      )}`
    });
    const roomName = colyseus.roomNames[0] ?? MULTIPLAYER_DEMO_ROOM_NAME;
    const roomA = await createLocalMultiplayerDemoHost({
      endpoint: colyseus.endpoint,
      roomName,
      sessionId: "room-alpha"
    });
    const roomB = await createLocalMultiplayerDemoHost({
      endpoint: colyseus.endpoint,
      roomName,
      sessionId: "room-bravo"
    });
    const clientA = createClient(roomA, "client-alpha");
    const clientB = createClient(roomB, "client-bravo");

    try {
      await clientA.connect();
      await clientB.connect();
      await waitFor(() => countActivePeers(roomA) === 2 && countActivePeers(roomB) === 2);

      await clientA.sendCommand({ type: "confirm", objectId: "relay-alpha" });
      await waitFor(() =>
        roomA.hostMessages.some(
          (message) => message.kind === "game.command" && message.sourcePeerId === "client-alpha"
        )
      );

      roomA.tick();
      roomB.tick();

      expect(roomA.app.snapshot().state.confirmations).toBe(1);
      expect(roomB.app.snapshot().state.confirmations).toBe(0);
      expect(countActivePeers(roomA)).toBe(2);
      expect(countActivePeers(roomB)).toBe(2);
    } finally {
      await clientA.dispose();
      await clientB.dispose();
      await roomA.dispose();
      await roomB.dispose();
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
