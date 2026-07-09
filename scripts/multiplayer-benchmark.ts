import { performance } from "node:perf_hooks";
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityHostLoop,
  createMultiplayerAuthorityReceiver,
  createMultiplayerLocalAuthorityLoop,
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
  runLocalAuthorityLoopBenchmark(),
  runSnapshotPlaybackBenchmark(),
  runPresentationProjectionBenchmark()
];

console.log(
  JSON.stringify(
    {
      benchmark: "multiplayer",
      package: "@gamekit/multiplayer-core",
      suites
    },
    null,
    2
  )
);

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

function createBenchmarkInput(sequence: number, playerIndex = 0): BenchmarkInput {
  return {
    playerId: `player-${playerIndex}`,
    sequence,
    dx: 1,
    dy: 2
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
