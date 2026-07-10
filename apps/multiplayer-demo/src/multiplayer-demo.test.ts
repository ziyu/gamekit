import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";
import { describe, expect, it } from "vitest";
import { createMultiplayerDemoClient, type MultiplayerDemoClient } from "./client";
import type { RealtimeArenaSnapshot } from "./realtime/domain";
import {
  REALTIME_ARENA_ACTION_KIND,
  REALTIME_ARENA_CHANNEL,
  REALTIME_ARENA_INPUT_KIND,
  REALTIME_ARENA_SNAPSHOT_KIND
} from "./realtime/protocol";
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

      await waitFor(() => harness.client.runtime.phase() !== "in-session");
      await expect(
        harness.sendClientCommand({ type: "confirm", objectId: "relay-alpha" })
      ).rejects.toBeTruthy();
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

  it("synchronizes the realtime arena through the host authoritative room", async () => {
    const colyseus = await createGameKitColyseusServer({
      roomName: `${MULTIPLAYER_DEMO_ROOM_NAME}_realtime_${Date.now()}_${Math.floor(
        Math.random() * 10000
      )}`
    });
    const host = await createLocalMultiplayerDemoHost({
      endpoint: colyseus.endpoint,
      roomName: colyseus.roomNames[0] ?? MULTIPLAYER_DEMO_ROOM_NAME,
      sessionId: "realtime-room"
    });
    const clientA = createClient(host, "client-a", "Runner");
    const clientB = createClient(host, "client-b", "Runner");

    try {
      await clientA.connect();
      await clientB.connect();
      host.tick(50);

      await waitFor(() => host.realtime.snapshot().snapshot.players.length === 2);
      await waitFor(
        () =>
          clientA.latestRealtimeSnapshot()?.snapshot.players.length === 2 &&
          clientB.latestRealtimeSnapshot()?.snapshot.players.length === 2
      );
      await waitFor(() => {
        const labels = host.realtime
          .snapshot()
          .snapshot.players.map((player) => player.label)
          .sort();
        return labels.join(",") === "Runner,Runner 2";
      });
      await waitFor(
        () =>
          clientA
            .latestRealtimeSnapshot()
            ?.snapshot.players.map((player) => player.label)
            .sort()
            .join(",") === "Runner,Runner 2" &&
          clientB
            .latestRealtimeSnapshot()
            ?.snapshot.players.map((player) => player.label)
            .sort()
            .join(",") === "Runner,Runner 2"
      );
      const hostSnapshotBeforeSpoof = clientA.latestRealtimeSnapshot();
      await clientB.runtime.send({
        channel: REALTIME_ARENA_CHANNEL,
        kind: REALTIME_ARENA_SNAPSHOT_KIND,
        payload: {}
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(clientA.latestRealtimeSnapshot()).toBe(hostSnapshotBeforeSpoof);

      await clientA.sendRealtimeAction({ type: "start" });
      await waitForHostRealtimeMessages(host, REALTIME_ARENA_ACTION_KIND, 1);
      host.tick(50);
      await waitFor(
        () => findSnapshotPlayer(host.realtime.snapshot().snapshot, "client-a").ready === true
      );
      expect(host.realtime.snapshot().snapshot.phase).toBe("lobby");
      expect(findSnapshotPlayer(host.realtime.snapshot().snapshot, "client-b").ready).toBe(false);

      await clientA.sendRealtimeAction({ type: "ready", ready: true });
      await clientB.sendRealtimeAction({ type: "ready", ready: true });
      await waitForHostRealtimeMessages(host, REALTIME_ARENA_ACTION_KIND, 3);
      host.tick(50);
      await waitFor(() =>
        host.realtime.snapshot().snapshot.players.every((player) => player.ready)
      );
      host.tick(50);
      await waitFor(
        () =>
          clientA.latestRealtimeSnapshot()?.snapshot.players.every((player) => player.ready) ===
            true &&
          clientB.latestRealtimeSnapshot()?.snapshot.players.every((player) => player.ready) ===
            true
      );

      await clientA.sendRealtimeAction({ type: "start" });
      await waitForHostRealtimeMessages(host, REALTIME_ARENA_ACTION_KIND, 4);
      host.tick(50);
      await waitFor(() => host.realtime.snapshot().snapshot.phase === "countdown");
      host.tick(1800);
      await waitFor(
        () =>
          clientA.latestRealtimeSnapshot()?.snapshot.phase === "running" &&
          clientB.latestRealtimeSnapshot()?.snapshot.phase === "running"
      );

      const playerAId = clientA.latestRealtimeSnapshot()?.playersByPeerId[clientA.peerId];
      expect(playerAId).toBe("client-a");
      const beforeX = findSnapshotPlayer(host.realtime.snapshot().snapshot, playerAId).position.x;
      await clientA.sendRealtimeInput({
        sequence: 1,
        clientTime: 0,
        moveX: 1,
        moveY: 0,
        sprint: false
      });
      await clientA.sendRealtimeInput({
        sequence: 2,
        clientTime: 50,
        moveX: 1,
        moveY: 0,
        sprint: false
      });
      await waitForHostRealtimeMessages(host, REALTIME_ARENA_INPUT_KIND, 2);
      host.tick(50);
      await waitFor(
        () =>
          findSnapshotPlayer(host.realtime.snapshot().snapshot, playerAId).lastInputSequence === 2
      );
      const afterFirstInputX = findSnapshotPlayer(host.realtime.snapshot().snapshot, playerAId)
        .position.x;
      expect(afterFirstInputX - beforeX).toBeCloseTo(7.75);
      expect(host.realtime.diagnostics()).toMatchObject({
        coalescedInputs: 1,
        queuedInputs: 0,
        maxQueuedInputs: 1
      });

      host.tick(50);
      const afterSecondInputX = findSnapshotPlayer(host.realtime.snapshot().snapshot, playerAId)
        .position.x;
      expect(afterSecondInputX - afterFirstInputX).toBeCloseTo(7.75);

      await clientA.sendRealtimeInput({
        sequence: 3,
        clientTime: 100,
        moveX: 0,
        moveY: 0,
        sprint: false
      });
      await waitForHostRealtimeMessages(host, REALTIME_ARENA_INPUT_KIND, 3);
      host.tick(50);
      await waitFor(
        () =>
          findSnapshotPlayer(host.realtime.snapshot().snapshot, playerAId).lastInputSequence === 3
      );
      const afterReleaseX = findSnapshotPlayer(host.realtime.snapshot().snapshot, playerAId)
        .position.x;
      expect(afterReleaseX).toBeCloseTo(afterSecondInputX);
      await waitFor(() => {
        const snapshotA = clientA.latestRealtimeSnapshot();
        const snapshotB = clientB.latestRealtimeSnapshot();
        if (!snapshotA || !snapshotB) {
          return false;
        }

        const playerAOnA = findSnapshotPlayer(snapshotA.snapshot, playerAId);
        const playerAOnB = findSnapshotPlayer(snapshotB.snapshot, playerAId);
        return (
          playerAOnA.position.x === afterReleaseX &&
          playerAOnA.position.x === playerAOnB.position.x &&
          playerAOnA.position.y === playerAOnB.position.y
        );
      });

      const authorityPlayerA = host.realtime.state.players.find(
        (player) => player.id === playerAId
      );
      const authorityCore = host.realtime.state.cores[0];
      expect(authorityPlayerA).toBeDefined();
      expect(authorityCore).toBeDefined();
      if (!authorityPlayerA || !authorityCore) {
        throw new Error("Expected authoritative player and core.");
      }
      authorityPlayerA.position = { ...authorityCore.position };
      await clientA.sendRealtimeAction({ type: "interact" });
      await waitForHostRealtimeMessages(host, REALTIME_ARENA_ACTION_KIND, 5);
      host.tick(50);
      await waitFor(() => {
        const observerSnapshot = clientB.latestRealtimeSnapshot();
        return (
          observerSnapshot !== undefined &&
          findSnapshotPlayer(observerSnapshot.snapshot, playerAId).carryingCoreId ===
            authorityCore.id
        );
      });

      await clientB.dispose();
      await waitFor(() => countActivePeers(host) === 2);
      host.tick(50);
      await waitFor(() => {
        const hostSnapshot = host.realtime.snapshot();
        const clientSnapshot = clientA.latestRealtimeSnapshot();
        return (
          hostSnapshot.snapshot.players.map((player) => player.id).join(",") === "client-a" &&
          clientSnapshot?.snapshot.players.map((player) => player.id).join(",") === "client-a" &&
          clientSnapshot.playersByPeerId[clientB.peerId] === undefined
        );
      });
    } finally {
      await clientA.dispose();
      await clientB.dispose();
      await host.dispose();
      await colyseus.dispose();
    }
  });
});

function createClient(
  host: LocalMultiplayerDemoHost,
  peerId: string,
  displayName = peerId
): MultiplayerDemoClient {
  return createMultiplayerDemoClient({
    endpoint: host.endpoint,
    roomName: host.roomName,
    sessionId: host.sessionId,
    hostPeerId: host.hostPeerId,
    peerId,
    displayName
  });
}

function countActivePeers(host: LocalMultiplayerDemoHost): number {
  return host.host
    .peers()
    .filter(
      (peer) => peer.status === "joining" || peer.status === "connected" || peer.status === "ready"
    ).length;
}

async function waitForHostRealtimeMessages(
  host: LocalMultiplayerDemoHost,
  kind: string,
  count: number
): Promise<void> {
  await waitFor(
    () =>
      host.hostMessages.filter(
        (message) => message.kind === kind && message.sourcePeerId !== host.hostPeerId
      ).length >= count
  );
}

function findSnapshotPlayer(
  snapshot: RealtimeArenaSnapshot,
  playerId: string | undefined
): RealtimeArenaSnapshot["players"][number] {
  expect(playerId).toBeDefined();
  const player = snapshot.players.find((candidate) => candidate.id === playerId);
  expect(player).toBeDefined();
  return player as RealtimeArenaSnapshot["players"][number];
}
