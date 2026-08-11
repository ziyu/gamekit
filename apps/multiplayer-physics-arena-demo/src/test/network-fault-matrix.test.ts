import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityHostLoop,
  createMultiplayerFixedStepInputBundle,
  createMultiplayerNetworkConditionSimulator,
  createMultiplayerPredictedLifecycleDomain,
  createMultiplayerRuntime,
  createMultiplayerSpeculativeEffectJournal,
  type MultiplayerFixedStepInputFrame,
  type MultiplayerNetworkConditionProfile
} from "@gamekit/multiplayer-core";
import { describe, expect, it } from "vitest";

import {
  ARENA_FIXED_STEP_MS,
  ARENA_INPUT_KIND,
  ARENA_SCHEMA_VERSION,
  ARENA_SNAPSHOT_KIND
} from "../shared/config";
import { readArenaMoveInput, type ArenaSnapshot } from "../shared/protocol";

type FaultSnapshot = Pick<ArenaSnapshot, "schemaVersion"> & { tick: number; ack: number };

const MATRIX: Array<{
  name: string;
  profile: MultiplayerNetworkConditionProfile;
  maximumAckLag: number;
}> = [
  {
    name: "baseline",
    profile: { latencyMs: 0, jitterMs: 0, lossPercent: 0, seed: 11 },
    maximumAckLag: 4
  },
  {
    name: "50ms latency and 20ms jitter",
    profile: { latencyMs: 50, jitterMs: 20, lossPercent: 0, seed: 22 },
    maximumAckLag: 12
  },
  {
    name: "100ms latency, 30ms jitter and 2% loss",
    profile: { latencyMs: 100, jitterMs: 30, lossPercent: 2, seed: 33 },
    maximumAckLag: 24
  },
  {
    name: "150ms latency, 50ms jitter, 5% loss and duplicates",
    profile: {
      latencyMs: 150,
      jitterMs: 50,
      lossPercent: 5,
      duplicatePercent: 2,
      seed: 44
    },
    maximumAckLag: 36
  }
];

describe("Knockout Arena deterministic network fault matrix", () => {
  for (const matrixCase of MATRIX) {
    it(matrixCase.name, async () => {
      const result = await runMatrixCase(matrixCase.profile);
      expect(result.finalSequence - result.acknowledgedSequence).toBeLessThanOrEqual(
        matrixCase.maximumAckLag
      );
      expect(result.processedSequences).toEqual(
        [...result.processedSequences].sort((left, right) => left - right)
      );
      expect(new Set(result.processedSequences).size).toBe(result.processedSequences.length);
      expect(result.authorityDiagnostics.rejectedInputs).toBe(0);
      expect(result.authorityDiagnostics.fixedStepInput).toMatchObject({
        queuedFrames: expect.any(Number),
        frameCapacityRejections: 0,
        sourceCapacityRejections: 0
      });
      expect(result.networkDiagnostics.capacityDrops).toBe(0);
      expect(result.networkDiagnostics.deliveryErrors).toBe(0);
      expect(result.acknowledgements).toEqual(
        [...result.acknowledgements].sort((left, right) => left - right)
      );
      if ((matrixCase.profile.lossPercent ?? 0) > 0) {
        expect(result.networkDiagnostics.droppedMessages).toBeGreaterThan(0);
        expect(result.authorityDiagnostics.fixedStepInput?.duplicateFrames ?? 0).toBeGreaterThan(0);
      }
    });
  }

  it("settles predicted item spawn, action, and hit once across loss, duplicates, and gaps", async () => {
    const simulator = createMultiplayerNetworkConditionSimulator(
      createMemoryMultiplayerBackend({ id: "arena.item-fault" }),
      {
        latencyMs: 90,
        jitterMs: 35,
        lossPercent: 8,
        duplicatePercent: 25,
        seed: 404,
        maxPendingDeliveries: 512,
        affects: (direction, message) =>
          direction === "outgoing" && message.kind === "arena.item-fault.snapshot"
      }
    );
    const host = createMultiplayerRuntime({
      id: "arena.item-fault.host",
      backend: simulator.backend
    });
    const client = createMultiplayerRuntime({
      id: "arena.item-fault.client",
      backend: simulator.backend
    });
    await host.createSession({
      id: "arena-item-fault",
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host" }
    });
    await client.joinSession({
      sessionId: "arena-item-fault",
      localPeer: { id: "client", role: "client" }
    });
    const lifecycle = createMultiplayerPredictedLifecycleDomain<number, number>({
      kind: "arena-item",
      generation: "stage-1",
      stepMs: ARENA_FIXED_STEP_MS,
      maxPending: 8,
      maxResolved: 32,
      maxBindings: 8
    });
    const journal = createMultiplayerSpeculativeEffectJournal<number, number>({
      generation: "stage-1",
      maxPending: 8,
      maxResolved: 32,
      maxAgeTicks: 120
    });
    lifecycle.register({ correlationId: "throw-1", localId: "item.local.g2", tick: 10, value: 1 });
    journal.anticipate({ effectId: "item-action:throw-1", tick: 10, value: 1 });
    journal.anticipate({ effectId: "item-hit:throw-1:bot.0", tick: 12, value: 2 });
    let deliveredFacts = 0;
    const unsubscribe = client.subscribe((message) => {
      if (message.kind !== "arena.item-fault.snapshot") return;
      const payload = message.payload as { tick: number; settled: boolean };
      if (!payload.settled) return;
      deliveredFacts += 1;
      lifecycle.sync({
        generation: "stage-1",
        authorityTime: payload.tick * ARENA_FIXED_STEP_MS,
        localTime: payload.tick * ARENA_FIXED_STEP_MS,
        authoritySpawns: [
          { correlationId: "throw-1", authorityId: "item.0.body.g2", tick: 18, value: 2 }
        ]
      });
      journal.resolve({
        effectId: "item-action:throw-1",
        generation: "stage-1",
        tick: 18,
        outcome: "confirm",
        authority: 1
      });
      journal.resolve({
        effectId: "item-hit:throw-1:bot.0",
        generation: "stage-1",
        tick: 20,
        outcome: "confirm",
        authority: 2
      });
    });

    for (let index = 0; index < 48; index += 1) {
      await host.send({
        channel: "reliable",
        kind: "arena.item-fault.snapshot",
        payload: { tick: 18 + index * 3, settled: index >= 4 }
      });
      await simulator.advance(ARENA_FIXED_STEP_MS);
    }
    await simulator.flush();

    expect(deliveredFacts).toBeGreaterThan(1);
    expect(lifecycle.diagnostics()).toMatchObject({
      bindings: 1,
      spawns: { matched: 1, pending: 0 }
    });
    expect(journal.diagnostics()).toMatchObject({
      confirmed: 2,
      pending: 0,
      duplicates: expect.any(Number)
    });
    expect(journal.diagnostics().duplicates).toBeGreaterThan(0);
    expect(simulator.diagnostics()).toMatchObject({
      droppedMessages: expect.any(Number),
      duplicatedMessages: expect.any(Number),
      capacityDrops: 0,
      deliveryErrors: 0
    });
    expect(simulator.diagnostics().droppedMessages).toBeGreaterThan(0);
    expect(simulator.diagnostics().duplicatedMessages).toBeGreaterThan(0);

    unsubscribe();
    lifecycle.dispose();
    journal.dispose();
    await client.dispose();
    await host.dispose();
    simulator.dispose();
  });
});

async function runMatrixCase(profile: MultiplayerNetworkConditionProfile) {
  const simulator = createMultiplayerNetworkConditionSimulator(
    createMemoryMultiplayerBackend({ id: `arena.fault.${profile.seed}` }),
    {
      ...profile,
      maxPendingDeliveries: 1_024,
      affects: (direction, message) =>
        direction === "outgoing" &&
        (message.kind === ARENA_INPUT_KIND || message.kind === ARENA_SNAPSHOT_KIND)
    }
  );
  const host = createMultiplayerRuntime({ id: "arena.fault.host", backend: simulator.backend });
  const client = createMultiplayerRuntime({
    id: "arena.fault.client",
    backend: simulator.backend
  });
  await host.createSession({
    id: "arena-fault-matrix",
    authority: "host-authoritative",
    localPeer: { id: "host", role: "host" }
  });
  await client.joinSession({
    sessionId: "arena-fault-matrix",
    localPeer: { id: "client", role: "client" }
  });
  let authorityAcknowledgedSequence = 0;
  let clientAcknowledgedSequence = 0;
  const acknowledgements: number[] = [];
  const processedSequences: number[] = [];
  const pendingInputs = new Map<number, MultiplayerFixedStepInputFrame>();
  const authority = createMultiplayerAuthorityHostLoop<
    never,
    ReturnType<typeof requireInput>,
    FaultSnapshot
  >({
    runtime: host,
    binding: createMultiplayerAuthorityBindingStore({
      sessionId: "arena-fault-matrix",
      mode: "host-authoritative",
      authorityPeerId: "host"
    }),
    inputKind: ARENA_INPUT_KIND,
    snapshotKind: ARENA_SNAPSHOT_KIND,
    readInput: readArenaMoveInput,
    inputSequence: (input) => input.sequence,
    inputDelivery: {
      mode: "redundant-bundle",
      maxBufferedFramesPerSource: 64,
      maxGapTicks: 3,
      gapPolicy: "hold-last"
    },
    maxInputsPerSourcePerTick: 1,
    maxQueuedInputsPerSource: 64,
    maxQueuedInputs: 128,
    handleInput({ message }) {
      const sequence = message.sequence;
      if (sequence !== undefined) {
        processedSequences.push(sequence);
        authorityAcknowledgedSequence = sequence;
      }
    },
    captureSnapshot: ({ tick }) => ({
      schemaVersion: ARENA_SCHEMA_VERSION,
      tick,
      ack: authorityAcknowledgedSequence
    })
  });
  const unsubscribe = client.subscribe((message) => {
    if (message.kind !== ARENA_SNAPSHOT_KIND) return;
    const snapshot = message.payload as FaultSnapshot;
    if (snapshot.ack > clientAcknowledgedSequence) clientAcknowledgedSequence = snapshot.ack;
    const last = acknowledgements.at(-1) ?? 0;
    if (snapshot.ack > last) acknowledgements.push(snapshot.ack);
    for (const sequence of pendingInputs.keys()) {
      if (sequence <= snapshot.ack) pendingInputs.delete(sequence);
    }
  });

  const totalFrames = 480;
  for (let sequence = 1; sequence <= totalFrames; sequence += 1) {
    const frame: MultiplayerFixedStepInputFrame = {
      sequence,
      payload: {
        sequence,
        moveX: sequence % 120 < 60 ? 1 : -1,
        moveZ: -1,
        jump: sequence % 90 === 0
      }
    };
    pendingInputs.set(sequence, frame);
    await client.send({
      channel: "reliable",
      kind: ARENA_INPUT_KIND,
      payload: createMultiplayerFixedStepInputBundle(selectRedundantFrames(pendingInputs, sequence))
    });
    await simulator.advance(ARENA_FIXED_STEP_MS);
    authority.beginTick(ARENA_FIXED_STEP_MS);
    await authority.commitTick();
    await simulator.advance(0);
  }
  for (let recoveryTick = 0; recoveryTick < 120; recoveryTick += 1) {
    await simulator.advance(ARENA_FIXED_STEP_MS);
    authority.beginTick(ARENA_FIXED_STEP_MS);
    await authority.commitTick();
    await simulator.advance(0);
  }
  await simulator.flush();

  const authorityDiagnostics = authority.diagnostics();
  const networkDiagnostics = simulator.diagnostics();
  unsubscribe();
  authority.dispose();
  await client.dispose();
  await host.dispose();
  simulator.dispose();
  return {
    finalSequence: totalFrames,
    acknowledgedSequence: clientAcknowledgedSequence,
    acknowledgements,
    processedSequences,
    authorityDiagnostics,
    networkDiagnostics
  };
}

function selectRedundantFrames(
  pending: ReadonlyMap<number, MultiplayerFixedStepInputFrame>,
  currentSequence: number
): MultiplayerFixedStepInputFrame[] {
  const current = pending.get(currentSequence);
  if (!current) throw new Error("Missing current fault-matrix input frame.");
  const ordered = [...pending.values()].sort((left, right) => left.sequence - right.sequence);
  if (ordered.length <= 8) return ordered;
  return [...ordered.slice(0, 7), current];
}

function requireInput(value: unknown) {
  const input = readArenaMoveInput(value);
  if (!input) throw new Error("Invalid Arena fault-matrix input.");
  return input;
}
