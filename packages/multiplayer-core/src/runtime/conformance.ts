import { createMultiplayerError, multiplayerErrorCodes } from "./errors";
import { createMultiplayerAuthorityBindingStore } from "./authority-binding";
import {
  createMultiplayerAuthorityHostLoop,
  createMultiplayerLocalAuthorityLoop,
  type MultiplayerAuthorityHostLoop,
  type MultiplayerLocalAuthorityLoop
} from "./authority-loop";
import {
  createMultiplayerAuthorityReceiver,
  type MultiplayerAuthorityReceiver,
  type MultiplayerAuthorityReceiverDiagnostics
} from "./authority-receiver";
import {
  MULTIPLAYER_ACTION_KIND,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_PATCH_KIND,
  MULTIPLAYER_RESULT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND
} from "./authority-types";
import { createMultiplayerRuntime } from "./runtime";
import type {
  MultiplayerBackendAdapter,
  MultiplayerMessageEnvelope,
  MultiplayerRuntime
} from "./types";

export type MultiplayerBackendConformanceOptions = {
  createBackend(): MultiplayerBackendAdapter;
  clock?: () => number;
  messageTimeoutMs?: number;
};

export type MultiplayerBackendConformanceReport = {
  sessionId: string;
  hostPeerId: string;
  clientPeerId: string;
  receivedByHost: MultiplayerMessageEnvelope[];
  receivedByClient: MultiplayerMessageEnvelope[];
};

export type MultiplayerAuthorityConformanceReport = {
  sessionId: string;
  isolatedSessionId: string;
  hostPeerId: string;
  clientPeerIds: [string, string];
  authoritativeSnapshot: MultiplayerConformanceSnapshotPayload;
  localSnapshot: MultiplayerConformanceSnapshotPayload;
  authoritativePatch: MultiplayerConformancePatchPayload;
  authoritativeResult: MultiplayerConformanceResultPayload;
  receivedByHost: MultiplayerMessageEnvelope[];
  receivedByIsolatedHost: MultiplayerMessageEnvelope[];
  hostDiagnostics: ReturnType<MultiplayerAuthorityHostLoop["diagnostics"]>;
  clientDiagnostics: {
    clientA: MultiplayerAuthorityReceiverDiagnostics;
    clientB: MultiplayerAuthorityReceiverDiagnostics;
  };
};

type MultiplayerConformanceActionPayload = {
  type: "start";
};

type MultiplayerConformanceInputPayload = {
  playerId: string;
  sequence: number;
  dx: number;
};

type MultiplayerConformanceSnapshotPayload = {
  started: boolean;
  positions: Record<string, number>;
  tick: number;
};

type MultiplayerConformancePatchPayload = {
  positions: Record<string, number>;
};

type MultiplayerConformanceResultPayload = {
  commandId: string;
  accepted: boolean;
};

type MultiplayerConformanceState = {
  started: boolean;
  positions: Record<string, number>;
};

export async function runMultiplayerBackendConformance(
  options: MultiplayerBackendConformanceOptions
): Promise<MultiplayerBackendConformanceReport> {
  const backend = options.createBackend();
  const receivedByHost: MultiplayerMessageEnvelope[] = [];
  const receivedByClient: MultiplayerMessageEnvelope[] = [];
  const host = createMultiplayerRuntime({
    id: "conformance.host",
    backend,
    clock: options.clock ?? (() => 1000),
    idGenerator: createConformanceIdGenerator("host")
  });
  const client = createMultiplayerRuntime({
    id: "conformance.client",
    backend,
    clock: options.clock ?? (() => 1000),
    idGenerator: createConformanceIdGenerator("client")
  });

  host.subscribe((message) => receivedByHost.push(message));
  client.subscribe((message) => receivedByClient.push(message));

  try {
    const session = await host.createSession({
      id: "conformance.session",
      localPeer: { id: "host", role: "host" }
    });
    await client.joinSession({
      sessionId: session.id,
      localPeer: { id: "client", role: "client" }
    });

    await host.send({
      channel: "reliable",
      kind: "game.command",
      payload: { action: "ping" }
    });

    await client.send({
      channel: "reliable",
      kind: "game.command",
      targetPeerIds: ["host"],
      payload: { action: "pong" }
    });

    await waitForConformanceMessages(
      () =>
        receivedByHost.some(
          (message) => message.kind === "game.command" && message.sourcePeerId === "client"
        ) &&
        receivedByClient.some(
          (message) => message.kind === "game.command" && message.sourcePeerId === "host"
        ),
      options.messageTimeoutMs ?? 500
    );
  } catch (error) {
    await host.dispose();
    await client.dispose();
    throw error;
  }

  const hostCommand = receivedByHost.find(
    (message) => message.kind === "game.command" && message.sourcePeerId === "client"
  );
  const clientCommand = receivedByClient.find(
    (message) => message.kind === "game.command" && message.sourcePeerId === "host"
  );
  assertConformance(Boolean(hostCommand), "Backend did not deliver targeted client command.");
  assertConformance(Boolean(clientCommand), "Backend did not deliver broadcast host command.");

  await client.leaveSession("conformance complete");
  const leftSession = client.session();
  assertConformance(!leftSession, "Backend kept client in session after leave.");

  await host.dispose();
  await client.dispose();
  assertConformance(
    host.snapshot().phase === "disposed" && client.snapshot().phase === "disposed",
    "Backend runtimes did not dispose cleanly."
  );

  return {
    sessionId: "conformance.session",
    hostPeerId: "host",
    clientPeerId: "client",
    receivedByHost,
    receivedByClient
  };
}

export async function runMultiplayerAuthorityConformance(
  options: MultiplayerBackendConformanceOptions
): Promise<MultiplayerAuthorityConformanceReport> {
  const backend = options.createBackend();
  const clock = options.clock ?? (() => 1000);
  const timeoutMs = options.messageTimeoutMs ?? 1000;
  const sessionId = "conformance.authority.session";
  const isolatedSessionId = "conformance.authority.isolated";
  const host = createMultiplayerRuntime({
    id: "conformance.authority.host",
    backend,
    clock,
    idGenerator: createConformanceIdGenerator("authority-host")
  });
  const clientA = createMultiplayerRuntime({
    id: "conformance.authority.client-a",
    backend,
    clock,
    idGenerator: createConformanceIdGenerator("authority-client-a")
  });
  const clientB = createMultiplayerRuntime({
    id: "conformance.authority.client-b",
    backend,
    clock,
    idGenerator: createConformanceIdGenerator("authority-client-b")
  });
  const isolatedHost = createMultiplayerRuntime({
    id: "conformance.authority.isolated-host",
    backend,
    clock,
    idGenerator: createConformanceIdGenerator("authority-isolated-host")
  });
  const isolatedClient = createMultiplayerRuntime({
    id: "conformance.authority.isolated-client",
    backend,
    clock,
    idGenerator: createConformanceIdGenerator("authority-isolated-client")
  });
  const receivedByHost: MultiplayerMessageEnvelope[] = [];
  const receivedByIsolatedHost: MultiplayerMessageEnvelope[] = [];
  const unsubscribeHost = host.subscribe((message) => receivedByHost.push(message));
  const unsubscribeIsolatedHost = isolatedHost.subscribe((message) =>
    receivedByIsolatedHost.push(message)
  );
  let hostLoop: MultiplayerAuthorityHostLoop | undefined;
  let localLoop:
    | MultiplayerLocalAuthorityLoop<
        MultiplayerConformanceActionPayload,
        MultiplayerConformanceInputPayload,
        MultiplayerConformanceSnapshotPayload
      >
    | undefined;
  let clientAReceiver: MultiplayerAuthorityReceiver | undefined;
  let clientBReceiver: MultiplayerAuthorityReceiver | undefined;

  try {
    await host.createSession({
      id: sessionId,
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host", playerId: "host-player" }
    });
    await clientA.joinSession({
      sessionId,
      localPeer: { id: "client-a", role: "client", playerId: "client-a" }
    });
    await clientB.joinSession({
      sessionId,
      localPeer: { id: "client-b", role: "client", playerId: "client-b" }
    });
    await waitForConformanceMessages(
      () =>
        hasConnectedPeer(host, "client-a") &&
        hasConnectedPeer(host, "client-b") &&
        hasConnectedPeer(clientA, "client-b") &&
        hasConnectedPeer(clientB, "client-a"),
      timeoutMs
    );

    const hostState = createConformanceState();
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId,
      mode: "host-authoritative",
      authorityPeerId: "host"
    });
    hostLoop = createMultiplayerAuthorityHostLoop<
      MultiplayerConformanceActionPayload,
      MultiplayerConformanceInputPayload,
      MultiplayerConformanceSnapshotPayload
    >({
      runtime: host,
      binding,
      readAction: readConformanceAction,
      readInput: readConformanceInput,
      inputSequence: (input) => input.sequence,
      inputSequenceKey: (input) => input.playerId,
      handleAction({ payload }) {
        applyConformanceAction(hostState, payload);
      },
      handleInput({ payload, message }) {
        if (message.sourcePeerId !== payload.playerId) {
          return {
            allowed: false,
            code: "player-source-mismatch",
            reason: "Input player id must match the message source peer."
          };
        }

        return applyConformanceInput(hostState, payload);
      },
      captureSnapshot({ tick }) {
        return captureConformanceSnapshot(hostState, tick);
      }
    });

    let latestClientASnapshot: MultiplayerConformanceSnapshotPayload | undefined;
    let latestClientBSnapshot: MultiplayerConformanceSnapshotPayload | undefined;
    let latestClientAPatch: MultiplayerConformancePatchPayload | undefined;
    let latestClientAResult: MultiplayerConformanceResultPayload | undefined;
    let latestClientBPatch: MultiplayerConformancePatchPayload | undefined;
    let latestClientBResult: MultiplayerConformanceResultPayload | undefined;
    clientAReceiver = createMultiplayerAuthorityReceiver<
      MultiplayerConformanceSnapshotPayload,
      MultiplayerConformancePatchPayload,
      MultiplayerConformanceResultPayload
    >({
      runtime: clientA,
      binding: createMultiplayerAuthorityBindingStore({
        sessionId,
        mode: "host-authoritative",
        authorityPeerId: "host",
        localPlayerId: "client-a"
      }),
      readSnapshot: readConformanceSnapshot,
      readPatch: readConformancePatch,
      readResult: readConformanceResult,
      applySnapshot(snapshot) {
        latestClientASnapshot = cloneConformanceSnapshot(snapshot);
      },
      applyPatch(patch) {
        latestClientAPatch = cloneConformancePatch(patch);
      },
      applyResult(result) {
        latestClientAResult = { ...result };
      }
    });
    clientBReceiver = createMultiplayerAuthorityReceiver<
      MultiplayerConformanceSnapshotPayload,
      MultiplayerConformancePatchPayload,
      MultiplayerConformanceResultPayload
    >({
      runtime: clientB,
      binding: createMultiplayerAuthorityBindingStore({
        sessionId,
        mode: "host-authoritative",
        authorityPeerId: "host",
        localPlayerId: "client-b"
      }),
      readSnapshot: readConformanceSnapshot,
      readPatch: readConformancePatch,
      readResult: readConformanceResult,
      applySnapshot(snapshot) {
        latestClientBSnapshot = cloneConformanceSnapshot(snapshot);
      },
      applyPatch(patch) {
        latestClientBPatch = cloneConformancePatch(patch);
      },
      applyResult(result) {
        latestClientBResult = { ...result };
      }
    });

    localLoop = createLocalConformanceLoop();

    await clientA.send({
      channel: "reliable",
      kind: MULTIPLAYER_SNAPSHOT_KIND,
      payload: {
        started: true,
        positions: { "client-a": 99, "client-b": 99 },
        tick: 99
      }
    });
    await waitForConformanceMessages(
      () => clientBReceiver?.diagnostics().rejectedMessages === 1,
      timeoutMs
    );
    await clientA.send({
      channel: "reliable",
      kind: MULTIPLAYER_PATCH_KIND,
      payload: {
        positions: { "client-a": 99 }
      }
    });
    await clientA.send({
      channel: "reliable",
      kind: MULTIPLAYER_RESULT_KIND,
      payload: {
        commandId: "spoofed-result",
        accepted: true
      }
    });
    await waitForConformanceMessages(
      () => (clientBReceiver?.diagnostics().rejectedMessages ?? 0) >= 3,
      timeoutMs
    );
    assertConformance(
      latestClientBPatch === undefined && latestClientBResult === undefined,
      "Client applied non-authority patch/result payloads."
    );

    await clientA.send({
      channel: "reliable",
      kind: MULTIPLAYER_ACTION_KIND,
      payload: { type: "start" }
    });
    await clientA.send({
      channel: "reliable",
      kind: MULTIPLAYER_INPUT_KIND,
      payload: { playerId: "client-a", sequence: 1, dx: 2 }
    });
    await clientB.send({
      channel: "reliable",
      kind: MULTIPLAYER_INPUT_KIND,
      payload: { playerId: "client-b", sequence: 1, dx: 3 }
    });
    await waitForConformanceMessages(
      () =>
        (hostLoop?.diagnostics().receivedActions ?? 0) >= 1 &&
        (hostLoop?.diagnostics().receivedInputs ?? 0) >= 2,
      timeoutMs
    );

    localLoop.dispatchAction({ type: "start" });
    localLoop.dispatchInput({ playerId: "client-a", sequence: 1, dx: 2 });
    localLoop.dispatchInput({ playerId: "client-b", sequence: 1, dx: 3 });
    hostLoop.tick(16);
    localLoop.tick(16);
    await waitForConformanceMessages(
      () => latestClientASnapshot?.tick === 1 && latestClientBSnapshot?.tick === 1,
      timeoutMs
    );
    await host.send({
      channel: "reliable",
      kind: MULTIPLAYER_PATCH_KIND,
      tick: 1,
      payload: {
        positions: { "client-a": 2, "client-b": 3 }
      }
    });
    await host.send({
      channel: "reliable",
      kind: MULTIPLAYER_RESULT_KIND,
      tick: 1,
      payload: {
        commandId: "start",
        accepted: true
      }
    });
    await waitForConformanceMessages(
      () =>
        latestClientAPatch?.positions["client-a"] === 2 &&
        latestClientBPatch?.positions["client-b"] === 3 &&
        latestClientAResult?.accepted === true &&
        latestClientBResult?.accepted === true,
      timeoutMs
    );
    assertConformanceSnapshotsEqual(
      latestClientASnapshot,
      localLoop.snapshot(),
      "Remote authoritative snapshot did not match local authority after the shared input log."
    );
    assertConformanceSnapshotsEqual(
      latestClientBSnapshot,
      localLoop.snapshot(),
      "Both clients did not apply the same authoritative snapshot."
    );

    await isolatedHost.createSession({
      id: isolatedSessionId,
      authority: "host-authoritative",
      localPeer: { id: "isolated-host", role: "host", playerId: "isolated-host" }
    });
    await isolatedClient.joinSession({
      sessionId: isolatedSessionId,
      localPeer: { id: "isolated-client", role: "client", playerId: "isolated-client" }
    });
    await isolatedClient.send({
      channel: "reliable",
      kind: MULTIPLAYER_INPUT_KIND,
      payload: { playerId: "isolated-client", sequence: 1, dx: 10 }
    });
    await waitForConformanceMessages(
      () =>
        receivedByIsolatedHost.some(
          (message) =>
            message.kind === MULTIPLAYER_INPUT_KIND && message.sourcePeerId === "isolated-client"
        ),
      timeoutMs
    );
    assertConformance(
      !receivedByHost.some((message) => message.sourcePeerId === "isolated-client"),
      "Input from an isolated session leaked into the primary authority session."
    );

    await clientA.send({
      channel: "reliable",
      kind: MULTIPLAYER_INPUT_KIND,
      payload: { playerId: "client-a", sequence: 1, dx: 5 }
    });
    await waitForConformanceMessages(
      () => (hostLoop?.diagnostics().receivedInputs ?? 0) >= 3,
      timeoutMs
    );
    localLoop.dispatchInput({ playerId: "client-a", sequence: 1, dx: 5 });
    hostLoop.tick(16);
    localLoop.tick(16);
    await waitForConformanceMessages(
      () => latestClientASnapshot?.tick === 2 && latestClientBSnapshot?.tick === 2,
      timeoutMs
    );
    assertConformanceSnapshotsEqual(
      latestClientASnapshot,
      localLoop.snapshot(),
      "Duplicate input changed remote state differently from local authority."
    );
    assertConformance(
      hostLoop.diagnostics().rejectedInputs >= 1,
      "Authority loop did not reject duplicate input."
    );

    await clientB.leaveSession("authority conformance complete");
    await waitForConformanceMessages(
      () => isLeftOrMissingPeer(host, "client-b") && clientB.session() === undefined,
      timeoutMs
    );
    assertConformance(
      !host
        .peers()
        .some(
          (peer) =>
            peer.id === "client-b" && (peer.status === "connected" || peer.status === "ready")
        ),
      "Leaving client stayed active in the authoritative session peer summary."
    );

    const authoritativeSnapshot = latestClientASnapshot;
    const authoritativePatch = latestClientAPatch;
    const authoritativeResult = latestClientAResult;
    const localSnapshot = localLoop.snapshot();
    if (!authoritativeSnapshot) {
      throw createMultiplayerError(
        multiplayerErrorCodes.invalidMessage,
        "Authority conformance did not produce a client snapshot."
      );
    }
    if (!authoritativePatch) {
      throw createMultiplayerError(
        multiplayerErrorCodes.invalidMessage,
        "Authority conformance did not produce a client patch."
      );
    }
    if (!authoritativeResult) {
      throw createMultiplayerError(
        multiplayerErrorCodes.invalidMessage,
        "Authority conformance did not produce a client result."
      );
    }

    return {
      sessionId,
      isolatedSessionId,
      hostPeerId: "host",
      clientPeerIds: ["client-a", "client-b"],
      authoritativeSnapshot,
      localSnapshot,
      authoritativePatch,
      authoritativeResult,
      receivedByHost,
      receivedByIsolatedHost,
      hostDiagnostics: hostLoop.diagnostics(),
      clientDiagnostics: {
        clientA: clientAReceiver.diagnostics(),
        clientB: clientBReceiver.diagnostics()
      }
    };
  } finally {
    clientAReceiver?.dispose();
    clientBReceiver?.dispose();
    hostLoop?.dispose();
    unsubscribeHost();
    unsubscribeIsolatedHost();
    await isolatedClient.dispose();
    await isolatedHost.dispose();
    await clientB.dispose();
    await clientA.dispose();
    await host.dispose();
  }
}

function assertConformance(condition: boolean, message: string): void {
  if (!condition) {
    throw createMultiplayerError(multiplayerErrorCodes.invalidMessage, message);
  }
}

function assertConformanceSnapshotsEqual(
  actual: MultiplayerConformanceSnapshotPayload | undefined,
  expected: MultiplayerConformanceSnapshotPayload,
  message: string
): void {
  assertConformance(Boolean(actual), message);
  assertConformance(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
  );
}

async function waitForConformanceMessages(
  predicate: () => boolean,
  timeoutMs: number
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createConformanceIdGenerator(peerId: string): () => string {
  let id = 0;

  return () => `conformance.${peerId}.${++id}`;
}

function createConformanceState(): MultiplayerConformanceState {
  return {
    started: false,
    positions: {}
  };
}

function createLocalConformanceLoop(): MultiplayerLocalAuthorityLoop<
  MultiplayerConformanceActionPayload,
  MultiplayerConformanceInputPayload,
  MultiplayerConformanceSnapshotPayload
> {
  const state = createConformanceState();

  return createMultiplayerLocalAuthorityLoop({
    binding: {
      sessionId: "conformance.local.session",
      mode: "local",
      authorityEndpoint: { kind: "local", id: "local" },
      localPlayerId: "client-a"
    },
    inputSequence: (input) => input.sequence,
    inputSequenceKey: (input) => input.playerId,
    handleAction({ payload }) {
      applyConformanceAction(state, payload);
    },
    handleInput({ payload }) {
      return applyConformanceInput(state, payload);
    },
    captureSnapshot({ tick }) {
      return captureConformanceSnapshot(state, tick);
    }
  });
}

function applyConformanceAction(
  state: MultiplayerConformanceState,
  action: MultiplayerConformanceActionPayload
): void {
  if (action.type === "start") {
    state.started = true;
  }
}

function applyConformanceInput(
  state: MultiplayerConformanceState,
  input: MultiplayerConformanceInputPayload
): { allowed: false; code: string; reason: string } | undefined {
  if (!state.started) {
    return {
      allowed: false,
      code: "not-started",
      reason: "Conformance game has not started."
    };
  }

  state.positions[input.playerId] = (state.positions[input.playerId] ?? 0) + input.dx;
  return undefined;
}

function captureConformanceSnapshot(
  state: MultiplayerConformanceState,
  tick: number
): MultiplayerConformanceSnapshotPayload {
  return {
    started: state.started,
    positions: { ...state.positions },
    tick
  };
}

function cloneConformanceSnapshot(
  snapshot: MultiplayerConformanceSnapshotPayload
): MultiplayerConformanceSnapshotPayload {
  return {
    started: snapshot.started,
    positions: { ...snapshot.positions },
    tick: snapshot.tick
  };
}

function cloneConformancePatch(
  patch: MultiplayerConformancePatchPayload
): MultiplayerConformancePatchPayload {
  return {
    positions: { ...patch.positions }
  };
}

function readConformanceAction(payload: unknown): MultiplayerConformanceActionPayload | undefined {
  if (!isRecord(payload) || payload.type !== "start") {
    return undefined;
  }

  return { type: "start" };
}

function readConformanceInput(payload: unknown): MultiplayerConformanceInputPayload | undefined {
  if (
    !isRecord(payload) ||
    typeof payload.playerId !== "string" ||
    typeof payload.sequence !== "number" ||
    typeof payload.dx !== "number"
  ) {
    return undefined;
  }

  return {
    playerId: payload.playerId,
    sequence: payload.sequence,
    dx: payload.dx
  };
}

function readConformanceSnapshot(
  payload: unknown
): MultiplayerConformanceSnapshotPayload | undefined {
  if (
    !isRecord(payload) ||
    typeof payload.started !== "boolean" ||
    typeof payload.tick !== "number" ||
    !isNumberRecord(payload.positions)
  ) {
    return undefined;
  }

  return {
    started: payload.started,
    positions: { ...payload.positions },
    tick: payload.tick
  };
}

function readConformancePatch(payload: unknown): MultiplayerConformancePatchPayload | undefined {
  if (!isRecord(payload) || !isNumberRecord(payload.positions)) {
    return undefined;
  }

  return {
    positions: { ...payload.positions }
  };
}

function readConformanceResult(payload: unknown): MultiplayerConformanceResultPayload | undefined {
  if (
    !isRecord(payload) ||
    typeof payload.commandId !== "string" ||
    typeof payload.accepted !== "boolean"
  ) {
    return undefined;
  }

  return {
    commandId: payload.commandId,
    accepted: payload.accepted
  };
}

function hasConnectedPeer(runtime: MultiplayerRuntime, peerId: string): boolean {
  return runtime.peers().some((peer) => peer.id === peerId && peer.status === "connected");
}

function isLeftOrMissingPeer(runtime: MultiplayerRuntime, peerId: string): boolean {
  const peer = runtime.peers().find((candidate) => candidate.id === peerId);
  return !peer || peer.status === "left" || peer.status === "disconnected";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "number");
}
