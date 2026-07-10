import { performance } from "node:perf_hooks";
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityHostLoop,
  createMultiplayerAuthorityReceiver,
  createMultiplayerLocalAuthorityLoop,
  createMultiplayerPredictionBuffer,
  createSnapshotPlayback,
  createSnapshotPresentationProjector,
  defineSnapshotVector2Track,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND,
  normalizeOutgoingMessage,
  type MultiplayerChannel,
  type MultiplayerMessageEnvelope,
  type MultiplayerMessageListener,
  type MultiplayerOutgoingMessage,
  type MultiplayerPeer,
  type MultiplayerRuntime,
  type MultiplayerSession,
  type MultiplayerSnapshot,
  type NetworkVector2,
  type PresentedSnapshotTracks
} from "../packages/multiplayer-core/src";
import {
  checkMultiplayerBenchmarkBudgets,
  multiplayerBenchmarkBudgetCount
} from "./multiplayer-benchmark-budget";

type BenchmarkSnapshot = {
  tick: number;
  positions: NetworkVector2[];
};

type BenchmarkInput = {
  playerId: string;
  sequence: number;
  dx: number;
  dy: number;
};

type BenchmarkPayload = {
  tick: number;
  x: number;
};

type BenchmarkPredictionState = {
  x: number;
  y: number;
};

type BenchmarkCase = Record<string, number | string>;

type BenchmarkSuite = {
  suite: string;
  cases: BenchmarkCase[];
};

type BenchmarkRuntime = MultiplayerRuntime & {
  emit<TPayload>(message: MultiplayerMessageEnvelope<TPayload>): void;
  sentCount(): number;
};

const RELIABLE_CHANNEL = "reliable";
const SESSION_ID = "benchmark-session";
const AUTHORITY_PEER_ID = "authority";
const TICK_MS = 50;
const BENCHMARK_CHANNEL: MultiplayerChannel = {
  id: RELIABLE_CHANNEL,
  reliability: "reliable",
  ordering: "ordered"
};

const suites: BenchmarkSuite[] = [
  runEnvelopeNormalizationBenchmark(),
  runAuthorityReceiverBenchmark(),
  runHostAuthorityLoopBenchmark(),
  runLatestInputCoalescingBenchmark(),
  runLocalAuthorityLoopBenchmark(),
  runPredictionReconciliationBenchmark(),
  runPredictionPresentationBenchmark(),
  runSnapshotPlaybackBenchmark(),
  runPresentationProjectionBenchmark()
];
const budgetCheckEnabled = process.argv.includes("--check");
const budgetFailures = budgetCheckEnabled ? checkMultiplayerBenchmarkBudgets(suites) : [];

console.log(
  JSON.stringify(
    {
      benchmark: "multiplayer",
      package: "@gamekit/multiplayer-core",
      suites,
      ...(budgetCheckEnabled
        ? {
            budgetCheck: {
              budgets: multiplayerBenchmarkBudgetCount(),
              passed: budgetFailures.length === 0,
              failures: budgetFailures
            }
          }
        : {})
    },
    null,
    2
  )
);

if (budgetFailures.length > 0) {
  process.exitCode = 1;
}

function runEnvelopeNormalizationBenchmark(): BenchmarkSuite {
  const cases = [100_000, 500_000].map((messages) => {
    let id = 0;
    let checksum = 0;
    const payload = { x: 1, y: 2 };
    const start = performance.now();
    for (let index = 0; index < messages; index += 1) {
      const envelope = normalizeOutgoingMessage(
        {
          channel: RELIABLE_CHANNEL,
          kind: MULTIPLAYER_INPUT_KIND,
          tick: index,
          payload
        },
        SESSION_ID,
        `client-${index % 16}`,
        index + 1,
        index,
        () => `benchmark.message.${++id}`
      );
      checksum += envelope.sequence ?? 0;
    }
    const durationMs = performance.now() - start;
    return {
      messages,
      durationMs: round(durationMs),
      microsecondsPerMessage: round((durationMs * 1000) / messages),
      checksum
    };
  });

  return {
    suite: "runtime-envelope-normalization",
    cases
  };
}

function runAuthorityReceiverBenchmark(): BenchmarkSuite {
  const cases = [
    { messages: 250_000, rejectedEvery: 0 },
    { messages: 250_000, rejectedEvery: 4 }
  ].map(({ messages, rejectedEvery }) => {
    const runtime = createBenchmarkRuntime();
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: SESSION_ID,
      mode: "host-authoritative",
      status: "bound",
      authorityEndpoint: {
        kind: "peer",
        id: AUTHORITY_PEER_ID,
        peerId: AUTHORITY_PEER_ID
      },
      authorityPeerId: AUTHORITY_PEER_ID
    });
    let checksum = 0;
    const receiver = createMultiplayerAuthorityReceiver<BenchmarkPayload>({
      runtime,
      binding,
      clock: () => messages,
      applySnapshot(snapshot) {
        checksum += snapshot.x;
      }
    });

    for (let index = 0; index < 1_000; index += 1) {
      runtime.emit(createSnapshotMessage(index, AUTHORITY_PEER_ID));
    }
    const before = receiver.diagnostics();

    const start = performance.now();
    for (let index = 0; index < messages; index += 1) {
      const rejected = rejectedEvery > 0 && index % rejectedEvery === rejectedEvery - 1;
      runtime.emit(
        createSnapshotMessage(index, rejected ? `stranger-${index % 8}` : AUTHORITY_PEER_ID)
      );
    }
    const durationMs = performance.now() - start;
    const diagnostics = receiver.diagnostics();
    receiver.dispose();

    return {
      messages,
      rejectedEvery,
      applied: diagnostics.appliedSnapshots - before.appliedSnapshots,
      rejected: diagnostics.rejectedMessages - before.rejectedMessages,
      durationMs: round(durationMs),
      microsecondsPerMessage: round((durationMs * 1000) / messages),
      checksum
    };
  });

  return {
    suite: "authority-receiver-source-gate",
    cases
  };
}

function runHostAuthorityLoopBenchmark(): BenchmarkSuite {
  const cases = [1, 8, 32].map((clients) => {
    const ticks = 5_000;
    const runtime = createBenchmarkRuntime(clients);
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: SESSION_ID,
      mode: "host-authoritative",
      status: "bound",
      authorityEndpoint: {
        kind: "peer",
        id: AUTHORITY_PEER_ID,
        peerId: AUTHORITY_PEER_ID
      },
      authorityPeerId: AUTHORITY_PEER_ID
    });
    let checksum = 0;
    const loop = createMultiplayerAuthorityHostLoop<never, BenchmarkInput, BenchmarkPayload>({
      runtime,
      binding,
      readInput(payload) {
        return isBenchmarkInput(payload) ? payload : undefined;
      },
      inputSequence(input) {
        return input.sequence;
      },
      inputSequenceKey(input) {
        return input.playerId;
      },
      handleInput(ctx) {
        checksum += ctx.payload.dx + ctx.payload.dy;
      },
      captureSnapshot(ctx) {
        return {
          tick: ctx.tick,
          x: checksum
        };
      }
    });

    for (let tick = 0; tick < 200; tick += 1) {
      emitClientInputs(runtime, clients, tick);
      loop.tick(16.67);
    }
    const before = loop.diagnostics();

    const start = performance.now();
    for (let tick = 0; tick < ticks; tick += 1) {
      emitClientInputs(runtime, clients, tick + 200);
      loop.tick(16.67);
    }
    const durationMs = performance.now() - start;
    const inputs = ticks * clients;
    const diagnostics = loop.diagnostics();
    loop.dispose();

    return {
      clients,
      ticks,
      inputs,
      acceptedInputs: diagnostics.acceptedInputs - before.acceptedInputs,
      durationMs: round(durationMs),
      microsecondsPerInput: round((durationMs * 1000) / inputs),
      msPerTick: round(durationMs / ticks),
      checksum
    };
  });

  return {
    suite: "authority-host-input-loop",
    cases
  };
}

function runLatestInputCoalescingBenchmark(): BenchmarkSuite {
  const cases = [8, 32].map((clients) => {
    const ticks = 5_000;
    const burstSize = 4;
    const runtime = createBenchmarkRuntime(clients);
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: SESSION_ID,
      mode: "host-authoritative",
      status: "bound",
      authorityEndpoint: {
        kind: "peer",
        id: AUTHORITY_PEER_ID,
        peerId: AUTHORITY_PEER_ID
      },
      authorityPeerId: AUTHORITY_PEER_ID
    });
    let checksum = 0;
    const loop = createMultiplayerAuthorityHostLoop<never, BenchmarkInput, BenchmarkPayload>({
      runtime,
      binding,
      readInput(payload) {
        return isBenchmarkInput(payload) ? payload : undefined;
      },
      inputSequence(input) {
        return input.sequence;
      },
      inputSequenceKey(input) {
        return input.playerId;
      },
      inputQueueMode: "latest",
      handleInput(ctx) {
        checksum += ctx.payload.sequence;
      },
      captureSnapshot(ctx) {
        return {
          tick: ctx.tick,
          x: checksum
        };
      }
    });

    for (let tick = 0; tick < 200; tick += 1) {
      emitClientInputBurst(runtime, clients, tick, burstSize);
      loop.tick(TICK_MS);
    }
    const before = loop.diagnostics();

    const start = performance.now();
    for (let tick = 0; tick < ticks; tick += 1) {
      emitClientInputBurst(runtime, clients, tick + 200, burstSize);
      loop.tick(TICK_MS);
    }
    const durationMs = performance.now() - start;
    const diagnostics = loop.diagnostics();
    const inputs = ticks * clients * burstSize;
    loop.dispose();

    return {
      clients,
      ticks,
      burstSize,
      inputs,
      acceptedInputs: diagnostics.acceptedInputs - before.acceptedInputs,
      coalescedInputs: diagnostics.coalescedInputs - before.coalescedInputs,
      maxQueuedInputs: diagnostics.maxQueuedInputs,
      durationMs: round(durationMs),
      microsecondsPerInput: round((durationMs * 1000) / inputs),
      msPerTick: round(durationMs / ticks),
      checksum
    };
  });

  return {
    suite: "authority-latest-input-coalescing",
    cases
  };
}

function runLocalAuthorityLoopBenchmark(): BenchmarkSuite {
  const cases = [100_000, 500_000].map((inputs) => {
    let checksum = 0;
    const loop = createMultiplayerLocalAuthorityLoop<never, BenchmarkInput, BenchmarkPayload>({
      binding: {
        sessionId: SESSION_ID,
        mode: "local",
        localPlayerId: "local-player"
      },
      inputSequence(input) {
        return input.sequence;
      },
      inputSequenceKey(input) {
        return input.playerId;
      },
      handleInput(ctx) {
        checksum += ctx.payload.dx + ctx.payload.dy;
      },
      captureSnapshot(ctx) {
        return {
          tick: ctx.tick,
          x: checksum
        };
      },
      applySnapshot(snapshot) {
        checksum += snapshot.tick === -1 ? 1 : 0;
      }
    });

    for (let index = 0; index < 1_000; index += 1) {
      loop.dispatchInput(createBenchmarkInput(index));
    }
    const before = loop.diagnostics();

    const start = performance.now();
    for (let index = 0; index < inputs; index += 1) {
      loop.dispatchInput(createBenchmarkInput(index + 1_000));
      if (index % 4 === 3) {
        loop.tick(16.67);
      }
    }
    const durationMs = performance.now() - start;
    const diagnostics = loop.diagnostics();

    return {
      inputs,
      ticks: diagnostics.tick - before.tick,
      acceptedInputs: diagnostics.acceptedInputs - before.acceptedInputs,
      durationMs: round(durationMs),
      microsecondsPerInput: round((durationMs * 1000) / inputs),
      checksum
    };
  });

  return {
    suite: "authority-local-input-loop",
    cases
  };
}

function runPredictionReconciliationBenchmark(): BenchmarkSuite {
  const cases = [
    { inputs: 100_000, reconcileEvery: 4 },
    { inputs: 100_000, reconcileEvery: 12 }
  ].map(({ inputs, reconcileEvery }) => {
    const prediction = createMultiplayerPredictionBuffer<BenchmarkPredictionState, BenchmarkInput>({
      initialState: { x: 0, y: 0 },
      maxInputs: 256,
      cloneState(state) {
        return { x: state.x, y: state.y };
      },
      applyInput(state, input) {
        state.x += input.dx;
        state.y += input.dy;
        return state;
      },
      measureCorrection(previous, next) {
        return Math.hypot(previous.x - next.x, previous.y - next.y);
      }
    });
    let authoritativeState: BenchmarkPredictionState = { x: 0, y: 0 };
    let lastAcknowledgedSequence = 0;
    let checksum = 0;

    for (let sequence = 1; sequence <= 1_000; sequence += 1) {
      prediction.predict({ sequence, input: createBenchmarkInput(sequence), timestamp: sequence });
      if (sequence % reconcileEvery === 0) {
        authoritativeState = { x: sequence, y: sequence * 2 };
        lastAcknowledgedSequence = sequence;
        prediction.reconcile({
          authoritativeState,
          acknowledgedSequence: lastAcknowledgedSequence
        });
      }
    }
    const before = prediction.diagnostics();

    const start = performance.now();
    for (let index = 0; index < inputs; index += 1) {
      const sequence = index + 1_001;
      prediction.predict({ sequence, input: createBenchmarkInput(sequence), timestamp: sequence });
      if (sequence % reconcileEvery === 0) {
        authoritativeState = { x: sequence, y: sequence * 2 };
        lastAcknowledgedSequence = sequence;
        const result = prediction.reconcile({
          authoritativeState,
          acknowledgedSequence: lastAcknowledgedSequence
        });
        checksum += result.state.x;
      }
    }
    const durationMs = performance.now() - start;
    const diagnostics = prediction.diagnostics();

    return {
      inputs,
      reconcileEvery,
      acknowledgedInputs: diagnostics.acknowledgedInputs - before.acknowledgedInputs,
      pendingInputs: diagnostics.pendingInputs,
      durationMs: round(durationMs),
      microsecondsPerInput: round((durationMs * 1000) / inputs),
      checksum: round(checksum)
    };
  });

  return {
    suite: "prediction-reconciliation",
    cases
  };
}

function runPredictionPresentationBenchmark(): BenchmarkSuite {
  const cases = [60, 120].map((presentationFps) => {
    const frames = 500_000;
    const frameDeltaMs = 1000 / presentationFps;
    const prediction = createMultiplayerPredictionBuffer<BenchmarkPredictionState, BenchmarkInput>({
      initialState: { x: 0, y: 0 },
      predictionStepMs: TICK_MS,
      cloneState(state) {
        return { x: state.x, y: state.y };
      },
      applyInput(state, input) {
        state.x += input.dx;
        state.y += input.dy;
        return state;
      },
      presentState(fromState, toState, context) {
        toState.x = fromState.x + (toState.x - fromState.x) * context.alpha;
        toState.y = fromState.y + (toState.y - fromState.y) * context.alpha;
        return toState;
      },
      measureCorrection(previous, next) {
        return Math.hypot(previous.x - next.x, previous.y - next.y);
      },
      correctionSmoothing: {
        durationMs: 100,
        maxMagnitude: 10,
        apply(target, context) {
          target.x +=
            (context.previousPresentedState.x - context.initialTargetState.x) *
            context.remainingAlpha;
          target.y +=
            (context.previousPresentedState.y - context.initialTargetState.y) *
            context.remainingAlpha;
          return target;
        }
      }
    });
    let sequence = 0;
    let timestamp = 0;
    let nextPredictionTime = 0;
    let checksum = 0;

    function presentFrame(): void {
      timestamp += frameDeltaMs;
      while (timestamp >= nextPredictionTime) {
        sequence += 1;
        prediction.predict({
          sequence,
          input: createPresentationBenchmarkInput(sequence),
          timestamp: nextPredictionTime
        });
        if (sequence % 12 === 0) {
          const current = prediction.state();
          prediction.reconcile({
            authoritativeState: { x: current.x - 0.25, y: current.y - 0.5 },
            acknowledgedSequence: sequence
          });
        }
        nextPredictionTime += TICK_MS;
      }
      const presented = prediction.present({ deltaMs: frameDeltaMs, timestamp });
      checksum += presented.x + presented.y;
    }

    for (let frame = 0; frame < 1_000; frame += 1) {
      presentFrame();
    }
    const before = prediction.diagnostics();
    const start = performance.now();
    for (let frame = 0; frame < frames; frame += 1) {
      presentFrame();
    }
    const durationMs = performance.now() - start;
    const diagnostics = prediction.diagnostics();

    return {
      frames,
      presentationFps,
      predictedInputs: diagnostics.predictedInputs - before.predictedInputs,
      smoothedCorrections: diagnostics.smoothedCorrections - before.smoothedCorrections,
      clampedFrames: diagnostics.clampedPresentationFrames - before.clampedPresentationFrames,
      durationMs: round(durationMs),
      microsecondsPerFrame: round((durationMs * 1000) / frames),
      checksum: round(checksum)
    };
  });

  return {
    suite: "prediction-presentation",
    cases
  };
}

function runSnapshotPlaybackBenchmark(): BenchmarkSuite {
  const cases = [
    { snapshots: 100_000, maxSnapshots: 24 },
    { snapshots: 100_000, maxSnapshots: 96 }
  ].map(({ snapshots, maxSnapshots }) => {
    const playback = createSnapshotPlayback<BenchmarkPayload>({
      interpolationDelayMs: 100,
      maxSnapshots,
      timeSource: "tick",
      readTime(entry) {
        return entry.snapshot.tick * TICK_MS;
      }
    });
    let checksum = 0;

    for (let tick = 0; tick < 1_000; tick += 1) {
      const sample = playback.present({ snapshot: { tick, x: tick } }, TICK_MS);
      checksum += sample.alpha;
    }

    const start = performance.now();
    for (let tick = 0; tick < snapshots; tick += 1) {
      const sample = playback.present({ snapshot: { tick: tick + 1_000, x: tick } }, TICK_MS);
      checksum += sample.alpha;
    }
    const durationMs = performance.now() - start;
    const diagnostics = playback.diagnostics();

    return {
      snapshots,
      maxSnapshots,
      bufferLength: diagnostics.bufferLength,
      durationMs: round(durationMs),
      microsecondsPerSnapshot: round((durationMs * 1000) / snapshots),
      checksum: round(checksum)
    };
  });

  return {
    suite: "snapshot-playback",
    cases
  };
}

function runPresentationProjectionBenchmark(): BenchmarkSuite {
  const cases = [100, 1_000, 5_000].map((trackCount) => {
    const frames = Math.max(120, Math.floor(1_000_000 / trackCount));
    const warmupFrames = Math.min(120, frames);
    const previous = createPresentationSnapshot(trackCount, 0, 0);
    const next = createPresentationSnapshot(trackCount, 1, 10);
    const playback = createSnapshotPlayback<BenchmarkSnapshot>({
      interpolationDelayMs: 0,
      readTime(entry) {
        return entry.snapshot.tick * TICK_MS;
      }
    });
    const projector = createSnapshotPresentationProjector<BenchmarkSnapshot>([
      defineSnapshotVector2Track<BenchmarkSnapshot>({
        selectInto(snapshot, writer) {
          for (let index = 0; index < snapshot.positions.length; index += 1) {
            const position = snapshot.positions[index];
            if (position) {
              writer.add(index, position);
            }
          }
        }
      })
    ]);
    const targets = Array.from({ length: trackCount }, () => ({ x: 0, y: 0 }));
    const fallback = { x: 0, y: 0 };

    playback.present({ snapshot: previous }, 0);
    const sample = playback.present({ snapshot: next }, TICK_MS / 2);

    for (let frame = 0; frame < warmupFrames; frame += 1) {
      projectAndWrite(projector.present(sample), targets, fallback);
    }

    const start = performance.now();
    let checksum = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      checksum += projectAndWrite(projector.present(sample), targets, fallback);
    }
    const durationMs = performance.now() - start;
    const writes = frames * trackCount;

    return {
      trackCount,
      frames,
      writes,
      durationMs: round(durationMs),
      msPerFrame: round(durationMs / frames),
      microsecondsPerTrackWrite: round((durationMs * 1000) / writes),
      checksum: round(checksum)
    };
  });

  return {
    suite: "presentation-projection",
    cases
  };
}

function createBenchmarkRuntime(clientCount = 1): BenchmarkRuntime {
  const listeners = new Set<MultiplayerMessageListener>();
  let sent = 0;
  const localPeer: MultiplayerPeer = {
    id: AUTHORITY_PEER_ID,
    role: "host",
    status: "connected"
  };
  const session: MultiplayerSession = {
    id: SESSION_ID,
    kind: "local",
    authority: "host-authoritative",
    status: "running",
    peers: [
      localPeer,
      ...Array.from({ length: clientCount }, (_, index) => ({
        id: `client-${index}`,
        role: "client",
        status: "connected" as const,
        playerId: `player-${index}`
      }))
    ]
  };
  const backend = {
    id: "benchmark",
    kind: "benchmark",
    capabilities: {
      channels: [BENCHMARK_CHANNEL]
    }
  };

  return {
    id: "benchmark-runtime",
    backendId: backend.id,
    phase() {
      return "in-session";
    },
    createSession() {
      return Promise.resolve(session);
    },
    joinSession() {
      return Promise.resolve(session);
    },
    leaveSession() {
      return Promise.resolve();
    },
    reconnect() {
      return Promise.resolve(session);
    },
    send<TPayload = unknown>(_message: MultiplayerOutgoingMessage<TPayload>) {
      sent += 1;
      return Promise.resolve();
    },
    subscribe<TPayload = unknown>(listener: MultiplayerMessageListener<TPayload>) {
      const wrapped = listener as MultiplayerMessageListener;
      listeners.add(wrapped);
      return () => {
        listeners.delete(wrapped);
      };
    },
    peers() {
      return session.peers;
    },
    localPeer() {
      return localPeer;
    },
    session() {
      return session;
    },
    snapshot(): MultiplayerSnapshot {
      return {
        id: "benchmark-runtime",
        backendId: backend.id,
        phase: "in-session",
        localPeer,
        session,
        peers: session.peers,
        sent,
        received: 0,
        backend,
        connection: {
          phase: "in-session",
          localPeer,
          session,
          peers: session.peers,
          sent,
          received: 0
        }
      };
    },
    dispose() {
      listeners.clear();
      return Promise.resolve();
    },
    emit<TPayload>(message: MultiplayerMessageEnvelope<TPayload>) {
      for (const listener of Array.from(listeners)) {
        listener(message);
      }
    },
    sentCount() {
      return sent;
    }
  };
}

function emitClientInputs(runtime: BenchmarkRuntime, clients: number, tick: number): void {
  for (let clientIndex = 0; clientIndex < clients; clientIndex += 1) {
    const sequence = tick + 1;
    runtime.emit({
      id: `input-${tick}-${clientIndex}`,
      sessionId: SESSION_ID,
      channel: RELIABLE_CHANNEL,
      kind: MULTIPLAYER_INPUT_KIND,
      sourcePeerId: `client-${clientIndex}`,
      sequence,
      tick,
      timestamp: tick,
      payload: createBenchmarkInput(sequence, clientIndex)
    });
  }
}

function emitClientInputBurst(
  runtime: BenchmarkRuntime,
  clients: number,
  tick: number,
  burstSize: number
): void {
  for (let clientIndex = 0; clientIndex < clients; clientIndex += 1) {
    for (let burstIndex = 0; burstIndex < burstSize; burstIndex += 1) {
      const sequence = tick * burstSize + burstIndex + 1;
      runtime.emit({
        id: `input-burst-${tick}-${clientIndex}-${burstIndex}`,
        sessionId: SESSION_ID,
        channel: RELIABLE_CHANNEL,
        kind: MULTIPLAYER_INPUT_KIND,
        sourcePeerId: `client-${clientIndex}`,
        sequence,
        tick,
        timestamp: tick,
        payload: createBenchmarkInput(sequence, clientIndex)
      });
    }
  }
}

function createBenchmarkInput(sequence: number, playerIndex = 0): BenchmarkInput {
  return {
    playerId: `player-${playerIndex}`,
    sequence,
    dx: 1,
    dy: 2
  };
}

function createPresentationBenchmarkInput(sequence: number): BenchmarkInput {
  const phase = Math.floor((sequence - 1) / 20) % 4;
  return {
    playerId: "player-0",
    sequence,
    dx: phase === 0 ? 1 : phase === 2 ? -1 : 0,
    dy: phase === 1 ? 1 : phase === 3 ? -1 : 0
  };
}

function isBenchmarkInput(value: unknown): value is BenchmarkInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "playerId" in value &&
    "sequence" in value &&
    "dx" in value &&
    "dy" in value &&
    typeof value.playerId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.dx === "number" &&
    typeof value.dy === "number"
  );
}

function createSnapshotMessage(
  tick: number,
  sourcePeerId: string
): MultiplayerMessageEnvelope<BenchmarkPayload> {
  return {
    id: `snapshot-${tick}-${sourcePeerId}`,
    sessionId: SESSION_ID,
    channel: RELIABLE_CHANNEL,
    kind: MULTIPLAYER_SNAPSHOT_KIND,
    sourcePeerId,
    sequence: tick + 1,
    tick,
    timestamp: tick,
    payload: {
      tick,
      x: tick
    }
  };
}

function createPresentationSnapshot(
  trackCount: number,
  tick: number,
  offset: number
): BenchmarkSnapshot {
  return {
    tick,
    positions: Array.from({ length: trackCount }, (_, index) => ({
      x: index + offset,
      y: index * 0.5 + offset
    }))
  };
}

function projectAndWrite(
  presented: PresentedSnapshotTracks,
  targets: NetworkVector2[],
  fallback: NetworkVector2
): number {
  let checksum = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    if (!target) {
      continue;
    }
    presented.vector2Into(index, target, fallback);
    checksum += target.x;
  }
  return checksum;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
