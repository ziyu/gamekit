import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";
import { createMultiplayerRuntime } from "@gamekit/multiplayer-core";
import { describe, expect, it } from "vitest";

import { createOutpostSiegeRoomClass, type OutpostSiegeRoom } from "../server";

describe("Outpost Room-owned authority", () => {
  it("keeps the headless App Host ticking after the party leader leaves", async () => {
    const roomName = uniqueRoomName();
    let room: OutpostSiegeRoom | undefined;
    const RoomClass = createOutpostSiegeRoomClass({
      fixedStepMs: 10,
      clock: () => 100,
      onRoomCreated(createdRoom) {
        room = createdRoom;
      }
    });
    const server = await createGameKitColyseusServer({ roomName, roomClass: RoomClass });
    const leader = createMultiplayerRuntime({
      id: "outpost.room-test.leader",
      backend: createColyseusMultiplayerBackend({
        endpoint: server.endpoint,
        roomName,
        joinByIdFallback: true
      }),
      connectContext: {
        localPeer: { id: "leader", role: "host", playerId: "player.leader" }
      },
      clock: () => 100
    });
    const client = createMultiplayerRuntime({
      id: "outpost.room-test.client",
      backend: createColyseusMultiplayerBackend({
        endpoint: server.endpoint,
        roomName,
        joinByIdFallback: true
      }),
      connectContext: {
        localPeer: { id: "client", role: "client", playerId: "player.client" }
      },
      clock: () => 100
    });

    try {
      await leader.createSession({
        id: "outpost-room-session",
        authority: "server-authoritative",
        localPeer: { id: "leader", role: "host", playerId: "player.leader" }
      });
      await client.joinSession({
        sessionId: "outpost-room-session",
        localPeer: { id: "client", role: "client", playerId: "player.client" }
      });

      await waitFor(() => {
        const snapshot = room?.authoritySnapshot();
        return (
          snapshot !== undefined &&
          snapshot.activePeers === 2 &&
          snapshot.ticks >= 2 &&
          leader.session()?.peers.length === 3 &&
          client.session()?.peers.length === 3
        );
      });
      expect(leader.session()?.peers.map((peer) => peer.id)).toEqual([
        "outpost-room-session.server",
        "leader",
        "client"
      ]);
      expect(client.session()?.peers.map((peer) => peer.id)).toEqual([
        "outpost-room-session.server",
        "leader",
        "client"
      ]);
      const beforeLeaderLeave = requireRoom(room).authoritySnapshot();
      expect(beforeLeaderLeave).toMatchObject({
        phase: "running",
        sessionId: "outpost-room-session",
        activePeers: 2,
        runtime: {
          hostPhase: "started",
          running: true,
          entityCount: 33,
          physicsBound: true,
          physicsBackend: "rapier2d",
          match: {
            phase: "lobby",
            participants: [
              { peerId: "leader", playerId: "player.leader", ready: false },
              { peerId: "client", playerId: "player.client", ready: false }
            ]
          }
        }
      });

      await client.send({
        id: "outpost-room.input.1",
        sessionId: "outpost-room-session",
        channel: "reliable",
        kind: "game.input",
        targetPeerIds: ["outpost-room-session.server"],
        sequence: 1,
        timestamp: 100,
        payload: { moveX: 1, moveY: 0 }
      });
      await waitFor(() => (room?.authoritySnapshot().receivedMessages ?? 0) === 1);

      await leader.dispose();
      await waitFor(() => {
        const snapshot = room?.authoritySnapshot();
        return (
          snapshot !== undefined &&
          snapshot.activePeers === 1 &&
          snapshot.ticks > beforeLeaderLeave.ticks &&
          snapshot.runtime?.match.participants.length === 1
        );
      });

      expect(requireRoom(room).authoritySnapshot()).toMatchObject({
        phase: "running",
        activePeers: 1,
        joins: 2,
        leaves: 1,
        receivedMessages: 1,
        runtime: {
          running: true,
          entityCount: 33,
          match: { phase: "lobby", participants: [{ peerId: "client" }] }
        }
      });
      expect(client.snapshot()).toMatchObject({
        phase: "in-session",
        session: { id: "outpost-room-session" }
      });
    } finally {
      await client.dispose();
      await leader.dispose();
      await server.dispose();
    }

    expect(requireRoom(room).authoritySnapshot()).toMatchObject({
      phase: "disposed",
      activePeers: 0,
      runtime: {
        hostPhase: "disposed",
        running: false,
        entityCount: 0,
        physicsBound: false
      }
    });
  });

  it("isolates App Host, World, Physics, ingress, and lifecycle between rooms", async () => {
    const roomName = uniqueRoomName();
    const rooms: OutpostSiegeRoom[] = [];
    const RoomClass = createOutpostSiegeRoomClass({
      fixedStepMs: 10,
      clock: () => 200,
      onRoomCreated(room) {
        rooms.push(room);
      }
    });
    const server = await createGameKitColyseusServer({ roomName, roomClass: RoomClass });
    const alpha = createMultiplayerRuntime({
      id: "outpost.room-isolation.alpha",
      backend: createColyseusMultiplayerBackend({
        endpoint: server.endpoint,
        roomName,
        joinByIdFallback: true
      }),
      connectContext: { localPeer: { id: "alpha-leader", role: "host" } },
      clock: () => 200
    });
    const bravo = createMultiplayerRuntime({
      id: "outpost.room-isolation.bravo",
      backend: createColyseusMultiplayerBackend({
        endpoint: server.endpoint,
        roomName,
        joinByIdFallback: true
      }),
      connectContext: { localPeer: { id: "bravo-leader", role: "host" } },
      clock: () => 200
    });

    try {
      await alpha.createSession({
        id: "outpost-room-alpha",
        authority: "server-authoritative",
        localPeer: { id: "alpha-leader", role: "host" }
      });
      await bravo.createSession({
        id: "outpost-room-bravo",
        authority: "server-authoritative",
        localPeer: { id: "bravo-leader", role: "host" }
      });
      await waitFor(
        () => rooms.length === 2 && rooms.every((room) => room.authoritySnapshot().ticks > 0)
      );

      const alphaRoom = requireSessionRoom(rooms, "outpost-room-alpha");
      const bravoRoom = requireSessionRoom(rooms, "outpost-room-bravo");
      expect(alphaRoom).not.toBe(bravoRoom);
      expect(alphaRoom.authoritySnapshot().runtime).toMatchObject({ entityCount: 33 });
      expect(bravoRoom.authoritySnapshot().runtime).toMatchObject({ entityCount: 33 });

      await alpha.send({
        id: "outpost-room-alpha.input.1",
        sessionId: "outpost-room-alpha",
        channel: "reliable",
        kind: "game.input",
        targetPeerIds: ["outpost-room-alpha.server"],
        sequence: 1,
        timestamp: 200,
        payload: { moveX: -1, moveY: 0 }
      });
      await waitFor(() => alphaRoom.authoritySnapshot().receivedMessages === 1);
      expect(bravoRoom.authoritySnapshot().receivedMessages).toBe(0);

      const bravoTickBeforeAlphaClose = bravoRoom.authoritySnapshot().ticks;
      await alpha.dispose();
      await waitFor(
        () =>
          alphaRoom.authoritySnapshot().phase === "disposed" &&
          bravoRoom.authoritySnapshot().ticks > bravoTickBeforeAlphaClose
      );
      expect(bravoRoom.authoritySnapshot()).toMatchObject({
        phase: "running",
        activePeers: 1,
        runtime: { running: true, entityCount: 33 }
      });
    } finally {
      await bravo.dispose();
      await alpha.dispose();
      await server.dispose();
    }

    expect(rooms).toHaveLength(2);
    expect(rooms.every((room) => room.authoritySnapshot().phase === "disposed")).toBe(true);
    expect(rooms.every((room) => room.authoritySnapshot().runtime?.entityCount === 0)).toBe(true);
  });

  it("runs four core clients through ready, countdown, physical movement, and leader leave", async () => {
    const roomName = uniqueRoomName();
    let room: OutpostSiegeRoom | undefined;
    const RoomClass = createOutpostSiegeRoomClass({
      fixedStepMs: 40,
      countdownMs: 80,
      onRoomCreated(createdRoom) {
        room = createdRoom;
      }
    });
    const server = await createGameKitColyseusServer({ roomName, roomClass: RoomClass });
    const clients = [
      createRoomClient(server.endpoint, roomName, "leader", "host"),
      createRoomClient(server.endpoint, roomName, "ranger-2", "client"),
      createRoomClient(server.endpoint, roomName, "ranger-3", "client"),
      createRoomClient(server.endpoint, roomName, "ranger-4", "client")
    ];
    let replicatedPhase: string | undefined;
    const replicatedInputAcks: number[] = [];
    const unsubscribe = clients[3]?.subscribe((message) => {
      if (
        message.kind === "game.snapshot" &&
        typeof message.payload === "object" &&
        message.payload !== null &&
        "phase" in message.payload &&
        typeof message.payload.phase === "string"
      ) {
        replicatedPhase = message.payload.phase;
      }
      if (
        message.kind === "game.snapshot" &&
        typeof message.payload === "object" &&
        message.payload !== null &&
        "inputAcksByPeerId" in message.payload &&
        typeof message.payload.inputAcksByPeerId === "object" &&
        message.payload.inputAcksByPeerId !== null
      ) {
        const acknowledged = (message.payload.inputAcksByPeerId as Record<string, unknown>)[
          "ranger-4"
        ];
        if (typeof acknowledged === "number" && replicatedInputAcks.at(-1) !== acknowledged) {
          replicatedInputAcks.push(acknowledged);
        }
      }
    });

    try {
      await clients[0]?.createSession({
        id: "outpost-four-client-session",
        authority: "server-authoritative",
        localPeer: { id: "leader", role: "host", playerId: "player.leader" }
      });
      for (const [index, client] of clients.entries()) {
        if (index === 0) {
          continue;
        }
        await client.joinSession({
          sessionId: "outpost-four-client-session",
          localPeer: {
            id: `ranger-${index + 1}`,
            role: "client",
            playerId: `player.ranger-${index + 1}`
          }
        });
      }

      await waitFor(() => {
        const match = room?.authoritySnapshot().runtime?.match;
        return match?.phase === "lobby" && match.participants.length === 4;
      });
      expect(requireRoom(room).authoritySnapshot().runtime).toMatchObject({
        entityCount: 33,
        match: { phase: "lobby", countdownMsRemaining: 80 }
      });

      await Promise.all(
        clients.map((client) =>
          client.send({
            channel: "reliable",
            kind: "game.action",
            targetPeerIds: ["outpost-four-client-session.server"],
            payload: { type: "ready", ready: true }
          })
        )
      );
      await waitFor(() => {
        const runtime = room?.authoritySnapshot().runtime;
        return (
          runtime?.match.phase === "running" &&
          runtime.match.players.length === 4 &&
          runtime.entityCount === 37 &&
          replicatedPhase === "running"
        );
      });

      const running = requireRoom(room).authoritySnapshot();
      expect(running).toMatchObject({
        activePeers: 4,
        runtime: {
          entityCount: 37,
          match: {
            phase: "running",
            participants: [
              { peerId: "leader", ready: true, slot: 0 },
              { peerId: "ranger-2", ready: true, slot: 1 },
              { peerId: "ranger-3", ready: true, slot: 2 },
              { peerId: "ranger-4", ready: true, slot: 3 }
            ],
            authorityInput: { acceptedActions: 4 }
          }
        }
      });
      const playerBefore = running.runtime?.match.players.find(
        (player) => player.playerId === "player.ranger-4"
      );
      expect(playerBefore).toBeDefined();

      await Promise.all(
        [1, 2, 3].map((sequence) =>
          clients[3]?.send({
            channel: "reliable",
            kind: "game.input",
            targetPeerIds: ["outpost-four-client-session.server"],
            sequence,
            payload: {
              sequence,
              moveX: 1,
              moveY: 0,
              aimX: 1_200,
              aimY: 500
            }
          })
        )
      );
      await waitFor(() => {
        const match = room?.authoritySnapshot().runtime?.match;
        const moved = match?.players.find((player) => player.playerId === "player.ranger-4");
        return (
          match?.inputAcksByPeerId["ranger-4"] === 3 &&
          replicatedInputAcks.includes(3) &&
          moved !== undefined &&
          playerBefore !== undefined &&
          moved.x > playerBefore.x
        );
      });
      expect(requireRoom(room).authoritySnapshot().runtime?.match.authorityInput).toMatchObject({
        acceptedInputs: 3,
        coalescedInputs: 0,
        queuedInputs: 0
      });
      expect(replicatedInputAcks).toEqual(expect.arrayContaining([1, 2, 3]));

      const beforeLeaderLeave = requireRoom(room).authoritySnapshot();
      await clients[0]?.dispose();
      await waitFor(() => {
        const snapshot = room?.authoritySnapshot();
        return (
          snapshot?.activePeers === 3 &&
          snapshot.ticks > beforeLeaderLeave.ticks &&
          snapshot.runtime?.match.players.length === 3
        );
      });
      expect(requireRoom(room).authoritySnapshot()).toMatchObject({
        phase: "running",
        activePeers: 3,
        runtime: {
          running: true,
          entityCount: 36,
          match: { phase: "running" }
        }
      });
      expect(
        requireRoom(room)
          .authoritySnapshot()
          .runtime?.match.participants.map((participant) => participant.peerId)
      ).toEqual(["ranger-2", "ranger-3", "ranger-4"]);
      expect(clients[3]?.phase()).toBe("in-session");
    } finally {
      unsubscribe?.();
      await Promise.all(clients.map((client) => client.dispose()));
      await server.dispose();
    }
  });
});

function createRoomClient(
  endpoint: string,
  roomName: string,
  peerId: string,
  role: "host" | "client"
) {
  return createMultiplayerRuntime({
    id: `outpost.room-four-client.${peerId}`,
    backend: createColyseusMultiplayerBackend({ endpoint, roomName, joinByIdFallback: true }),
    connectContext: {
      localPeer: { id: peerId, role, playerId: `player.${peerId}` }
    }
  });
}

function uniqueRoomName(): string {
  return `outpost_room_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
}

function requireRoom(room: OutpostSiegeRoom | undefined): OutpostSiegeRoom {
  if (!room) {
    throw new Error("Outpost test Room was not created.");
  }
  return room;
}

function requireSessionRoom(rooms: OutpostSiegeRoom[], sessionId: string): OutpostSiegeRoom {
  const room = rooms.find((candidate) => candidate.authoritySnapshot().sessionId === sessionId);
  if (!room) {
    throw new Error(`Missing Outpost test Room for session: ${sessionId}`);
  }
  return room;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("Timed out waiting for Outpost Room authority state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
