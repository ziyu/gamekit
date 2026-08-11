import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";
import {
  createMultiplayerFixedStepInputBundle,
  createMultiplayerRuntime,
  type MultiplayerMessageEnvelope
} from "@gamekit/multiplayer-core";
import { describe, expect, it } from "vitest";

import {
  ARENA_INPUT_KIND,
  ARENA_ROOM_NAME,
  ARENA_SNAPSHOT_KIND,
  arenaPlayerMemberId
} from "../shared/config";
import { readArenaSnapshot, type ArenaSnapshot } from "../shared/protocol";
import { KnockoutArenaRoom } from "../server/arena-room";

describe("Knockout Arena Room authority", () => {
  it("replicates one full physics island and acknowledges redundant input from two clients", async () => {
    const server = await createGameKitColyseusServer({
      roomName: ARENA_ROOM_NAME,
      roomClass: KnockoutArenaRoom
    });
    const sessionId = "knockout-test";
    const clientA = createClient(server.endpoint, "bean-a");
    const clientB = createClient(server.endpoint, "bean-b");
    const snapshotsA: ArenaSnapshot[] = [];
    const snapshotsB: ArenaSnapshot[] = [];
    const unsubscribeA = clientA.subscribe((message) => captureSnapshot(message, snapshotsA));
    const unsubscribeB = clientB.subscribe((message) => captureSnapshot(message, snapshotsB));

    try {
      await clientA.createSession({
        id: sessionId,
        kind: "private",
        authority: "server-authoritative",
        localPeer: { id: "bean-a", displayName: "Bean A", role: "host" }
      });
      await clientB.joinSession({
        sessionId,
        localPeer: { id: "bean-b", displayName: "Bean B", role: "client" }
      });
      await waitFor(() =>
        snapshotsA.some(
          (snapshot) =>
            snapshot.playerIdsByPeerId["bean-a"] === arenaPlayerMemberId(0) &&
            snapshot.playerIdsByPeerId["bean-b"] === arenaPlayerMemberId(1)
        )
      );

      await Promise.all([
        clientA.send({
          channel: "reliable",
          kind: ARENA_INPUT_KIND,
          payload: createMultiplayerFixedStepInputBundle([
            { sequence: 1, payload: { sequence: 1, moveX: 1, moveZ: 0, jump: false } },
            { sequence: 2, payload: { sequence: 2, moveX: 1, moveZ: -1, jump: false } }
          ])
        }),
        clientB.send({
          channel: "reliable",
          kind: ARENA_INPUT_KIND,
          payload: createMultiplayerFixedStepInputBundle([
            { sequence: 1, payload: { sequence: 1, moveX: -1, moveZ: 0, jump: false } }
          ])
        })
      ]);
      await waitFor(() => {
        const latest = snapshotsA.at(-1);
        return (
          (latest?.inputAcksByPeerId["bean-a"] ?? 0) >= 2 &&
          (latest?.inputAcksByPeerId["bean-b"] ?? 0) >= 1
        );
      });

      const latestA = snapshotsA.at(-1)!;
      const latestB = snapshotsB.at(-1)!;
      expect(latestA.frame.islandId).toBe("knockout.full-arena");
      expect(latestA.frame.members).toHaveLength(14);
      expect(latestB.frame.tick).toBeGreaterThan(0);
      expect(latestA.authority).toMatchObject({
        activePeers: 2,
        acceptedInputs: 3,
        rejectedInputs: 0
      });
      expect(latestA.authority.payloadBytes).toBeGreaterThan(1_000);
      expect(latestA.actorControlsByMemberId).toMatchObject({
        "player.0": { moveX: 0, moveZ: 0, jump: false },
        "player.1": { moveX: 0, moveZ: 0, jump: false }
      });
      expect(Object.keys(latestA.actorControlsByMemberId)).toHaveLength(8);
    } finally {
      unsubscribeA();
      unsubscribeB();
      await clientA.dispose();
      await clientB.dispose();
      await server.dispose();
    }
  }, 15_000);
});

function createClient(endpoint: string, peerId: string) {
  return createMultiplayerRuntime({
    id: `knockout.test.${peerId}`,
    backend: createColyseusMultiplayerBackend({
      endpoint,
      roomName: ARENA_ROOM_NAME,
      joinByIdFallback: true
    }),
    connectContext: {
      localPeer: { id: peerId, displayName: peerId, role: "client" }
    }
  });
}

function captureSnapshot(message: MultiplayerMessageEnvelope, snapshots: ArenaSnapshot[]): void {
  if (message.kind !== ARENA_SNAPSHOT_KIND) return;
  const snapshot = readArenaSnapshot(message.payload);
  if (snapshot) snapshots.push(snapshot);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 5_000) throw new Error("Timed out waiting for arena authority.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
