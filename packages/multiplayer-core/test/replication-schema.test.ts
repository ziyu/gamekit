import {
  createSnapshotPresentationProjector,
  defineMultiplayerReplicationEntityPresentation,
  defineMultiplayerReplicationSchema,
  type MultiplayerClientPredictionReadContext,
  type MultiplayerClientReplicationSnapshotContext,
  type MultiplayerMessageEnvelope,
  type SnapshotBufferSample
} from "../src";
import { describe, expect, it } from "vitest";

type Player = {
  id: string;
  generation: number;
  x: number;
  y: number;
  facing: number;
};

type Snapshot = {
  tick: number;
  serverTime: number;
  players: Player[];
  acknowledgements: Record<string, number>;
};

describe("multiplayer replication schema", () => {
  it("compiles decoder, tick, local identity, acknowledgement, and presentation bindings", () => {
    const players = defineMultiplayerReplicationEntityPresentation<Snapshot, Player>({
      id: "players",
      select: (snapshot) => snapshot.players,
      identity: (player) => player.id,
      generation: (player) => player.generation,
      fields: [
        { id: "position", kind: "vector2", read: (player) => ({ x: player.x, y: player.y }) },
        { id: "facing", kind: "angle-radians", read: (player) => player.facing }
      ]
    });
    const schema = defineMultiplayerReplicationSchema<Snapshot, string, Player>({
      id: "test.snapshot",
      version: "2",
      decode(payload) {
        const value = payload as Partial<Snapshot>;
        return Array.isArray(value.players) && typeof value.tick === "number"
          ? (value as Snapshot)
          : undefined;
      },
      tick: (snapshot) => snapshot.tick,
      time: (snapshot) => snapshot.tick * 50,
      serverTime: (snapshot) => snapshot.serverTime,
      presentation: [players],
      local: {
        select: (snapshot, playerId) => snapshot.players.find((player) => player.id === playerId),
        acknowledgedSequence: (snapshot, playerId) => snapshot.acknowledgements[playerId]
      }
    });
    const binding = schema.bindClient<{ x: number; y: number }, undefined>({
      identity: () => "local",
      state: (player) => ({ x: player.x, y: player.y })
    });
    const snapshot: Snapshot = {
      tick: 4,
      serverTime: 200,
      players: [{ id: "local", generation: 3, x: 10, y: 6, facing: Math.PI }],
      acknowledgements: { local: 8 }
    };
    const message = snapshotMessage(snapshot);

    expect(binding.readSnapshot(snapshot, message)).toBe(snapshot);
    expect(
      binding.toBufferEntry({ snapshot, message } as MultiplayerClientReplicationSnapshotContext<
        Snapshot,
        undefined
      >)
    ).toEqual({
      snapshot,
      tick: 4,
      time: 200,
      serverTime: 200,
      version: "2",
      receivedAt: 250
    });
    const readContext = { snapshot } as MultiplayerClientPredictionReadContext<Snapshot, undefined>;
    expect(binding.readAuthoritativeState(readContext)).toEqual({ x: 10, y: 6 });
    expect(binding.readAcknowledgedSequence(readContext)).toBe(8);

    const projector = createSnapshotPresentationProjector(binding.tracks ?? []);
    const presented = projector.present(sample(snapshot));
    expect(
      presented.vector2(players.key("position", snapshot.players[0]!), { x: 0, y: 0 })
    ).toEqual({ x: 10, y: 6 });
    expect(presented.angleRadians(players.key("facing", snapshot.players[0]!), 0)).toBe(Math.PI);
  });

  it("rejects mismatched versions, invalid ticks, malformed payloads, and duplicate field ids", () => {
    const schema = defineMultiplayerReplicationSchema<Snapshot, string, Player>({
      id: "test.snapshot",
      version: "1",
      decode(payload) {
        if (payload === "throw") {
          throw new Error("malformed");
        }
        return payload as Snapshot;
      },
      tick: (snapshot) => snapshot.tick,
      local: { select: (snapshot) => snapshot.players[0] }
    });
    const binding = schema.bindClient({
      identity: () => "local",
      state: (player) => player
    });
    const invalidTick = { tick: -1, serverTime: 0, players: [], acknowledgements: {} };

    expect(
      binding.readSnapshot(invalidTick, {
        ...snapshotMessage(invalidTick),
        schemaVersion: "1"
      })
    ).toBeUndefined();
    expect(
      binding.readSnapshot(
        { ...invalidTick, tick: 1 },
        {
          ...snapshotMessage({ ...invalidTick, tick: 1 }),
          schemaVersion: "2"
        }
      )
    ).toBeUndefined();
    expect(binding.readSnapshot("throw", snapshotMessage("throw"))).toBeUndefined();
    expect(() =>
      defineMultiplayerReplicationEntityPresentation<Snapshot, Player>({
        id: "players",
        select: (snapshot) => snapshot.players,
        identity: (player) => player.id,
        fields: [
          { id: "position", kind: "scalar", read: (player) => player.x },
          { id: "position", kind: "scalar", read: (player) => player.y }
        ]
      })
    ).toThrow("Duplicate replication presentation field");
  });
});

function snapshotMessage(payload: unknown): MultiplayerMessageEnvelope {
  return {
    id: "snapshot-1",
    sessionId: "session-1",
    channel: "state",
    kind: "game.snapshot",
    sourcePeerId: "authority",
    timestamp: 250,
    payload
  };
}

function sample(snapshot: Snapshot): SnapshotBufferSample<Snapshot> {
  return {
    status: "exact",
    renderTime: 200,
    sampleTime: 200,
    delayMs: 0,
    alpha: 1,
    next: { snapshot, time: 200, tick: 4 },
    snapshotAgeMs: 0,
    bufferLength: 1
  };
}
