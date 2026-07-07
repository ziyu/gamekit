import { createEventBus } from "@gamekit/event-bus";
import { describe, expect, it } from "vitest";
import {
  createMultiplayerBridgeModule,
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityHostLoop,
  createMultiplayerAuthorityReceiver,
  createMultiplayerLocalAuthorityLoop,
  createMultiplayerRuntime,
  MULTIPLAYER_ACTION_KIND,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND,
  type MultiplayerBackendAdapter,
  type MultiplayerBackendConnection,
  type MultiplayerBackendListener,
  type MultiplayerMessageEnvelope,
  type MultiplayerSession
} from "../src";

describe("createMultiplayerRuntime", () => {
  it("creates sessions and normalizes outgoing messages", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend,
      clock: () => 123,
      idGenerator: () => "message-1"
    });

    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host", role: "host" }
    });
    await runtime.send({
      channel: "reliable",
      kind: "game.command",
      payload: { action: "move" }
    });

    expect(fake.sent).toEqual([
      {
        id: "message-1",
        sessionId: "session-1",
        channel: "reliable",
        kind: "game.command",
        sourcePeerId: "host",
        sequence: 1,
        timestamp: 123,
        payload: { action: "move" }
      }
    ]);
    expect(runtime.snapshot()).toMatchObject({
      id: "runtime",
      backendId: "fake",
      phase: "in-session",
      sent: 1,
      received: 0,
      session: {
        id: "session-1"
      },
      localPeer: {
        id: "host"
      }
    });
  });

  it("cleans listeners on dispose and rejects later sends", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const received: MultiplayerMessageEnvelope[] = [];

    runtime.subscribe((message) => received.push(message));
    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });
    await runtime.dispose();
    fake.emit({
      id: "ignored",
      sessionId: "session-1",
      channel: "reliable",
      kind: "game.command",
      sourcePeerId: "remote",
      timestamp: 0,
      payload: {}
    });

    expect(received).toEqual([]);
    await expect(
      runtime.send({
        channel: "reliable",
        kind: "game.command",
        payload: {}
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [GameError: Multiplayer runtime has been disposed.]
    `);
  });

  it("refreshes phase from the backend connection snapshot", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });

    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });
    expect(runtime.phase()).toBe("in-session");

    fake.dropSession();

    expect(runtime.phase()).toBe("connected");
    expect(runtime.session()).toBeUndefined();
  });
});

describe("multiplayer authority helpers", () => {
  it("applies snapshots only from the bound authority source", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "client-runtime",
      backend: fake.backend,
      clock: () => 100
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "client", role: "client" }
    });
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host",
      localPlayerId: "player-client"
    });
    let latestSnapshot: { x: number } | undefined;
    const receiver = createMultiplayerAuthorityReceiver<{ x: number }>({
      runtime,
      binding,
      clock: () => 150,
      readSnapshot(payload) {
        return isRecord(payload) && typeof payload.x === "number" ? { x: payload.x } : undefined;
      },
      applySnapshot(snapshot) {
        latestSnapshot = snapshot;
      }
    });

    fake.emit(messageFrom("client", MULTIPLAYER_SNAPSHOT_KIND, { x: 99 }));
    fake.emit(messageFrom("host", MULTIPLAYER_SNAPSHOT_KIND, { x: 7 }, { tick: 3 }));

    expect(latestSnapshot).toEqual({ x: 7 });
    expect(receiver.diagnostics()).toMatchObject({
      receivedSnapshots: 2,
      appliedSnapshots: 1,
      rejectedMessages: 1,
      lastAppliedTick: 3,
      lastSnapshotAgeMs: 50,
      lastRejected: {
        code: "non-authority-source",
        sourcePeerId: "client"
      }
    });
    expect(binding.current()).toMatchObject({ tick: 3 });
  });

  it("runs host authority actions and inputs before broadcasting a snapshot", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "host-runtime",
      backend: fake.backend,
      clock: () => 200
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host" }
    });
    const state = { started: false, x: 0 };
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host"
    });
    const loop = createMultiplayerAuthorityHostLoop<ActionPayload, InputPayload, SnapshotPayload>({
      runtime,
      binding,
      readAction: readAction,
      readInput: readInput,
      inputSequence: (input) => input.sequence,
      handleAction({ payload }) {
        if (payload.type === "start") {
          state.started = true;
        }
      },
      handleInput({ payload }) {
        if (!state.started) {
          return { allowed: false, code: "not-started", reason: "Game has not started." };
        }
        state.x += payload.dx;
      },
      captureSnapshot({ tick }) {
        return { ...state, tick };
      }
    });

    fake.emit(messageFrom("client", MULTIPLAYER_ACTION_KIND, { type: "start" }));
    fake.emit(messageFrom("client", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 2 }));
    loop.tick(16);
    await waitFor(() => fake.sent.some((message) => message.kind === MULTIPLAYER_SNAPSHOT_KIND));

    expect(state).toEqual({ started: true, x: 2 });
    expect(fake.sent).toEqual([
      expect.objectContaining({
        kind: MULTIPLAYER_SNAPSHOT_KIND,
        sourcePeerId: "host",
        tick: 1,
        payload: { started: true, x: 2, tick: 1 }
      })
    ]);
    expect(loop.diagnostics()).toMatchObject({
      tick: 1,
      receivedActions: 1,
      acceptedActions: 1,
      receivedInputs: 1,
      acceptedInputs: 1,
      sentSnapshots: 1
    });
  });

  it("uses the same action and input contract for local authority", () => {
    const state = { started: false, x: 0 };
    const loop = createMultiplayerLocalAuthorityLoop<ActionPayload, InputPayload, SnapshotPayload>({
      binding: {
        sessionId: "local-session",
        mode: "local",
        localPlayerId: "local-player"
      },
      inputSequence: (input) => input.sequence,
      handleAction({ payload }) {
        if (payload.type === "start") {
          state.started = true;
        }
      },
      handleInput({ payload }) {
        if (!state.started) {
          return { allowed: false, code: "not-started", reason: "Game has not started." };
        }
        state.x += payload.dx;
      },
      tick() {
        // Local authority still flows through the same tick boundary as remote authority.
      },
      captureSnapshot({ tick }) {
        return { ...state, tick };
      }
    });

    expect(loop.binding()).toMatchObject({
      mode: "local",
      status: "bound",
      authorityEndpoint: { kind: "local", id: "local" }
    });
    expect(loop.dispatchAction({ type: "start" })).toEqual({ allowed: true });
    expect(loop.dispatchInput({ sequence: 1, dx: 2 })).toEqual({ allowed: true });
    expect(loop.dispatchInput({ sequence: 1, dx: 2 })).toMatchObject({
      allowed: false,
      code: "duplicate-input"
    });
    loop.tick(16);

    expect(loop.snapshot()).toEqual({ started: true, x: 2, tick: 1 });
    expect(loop.diagnostics()).toMatchObject({
      receivedActions: 1,
      acceptedActions: 1,
      receivedInputs: 2,
      acceptedInputs: 1,
      rejectedInputs: 1,
      sentSnapshots: 1
    });
  });
});

describe("createMultiplayerBridgeModule", () => {
  it("queues commands until the game system tick", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const eventBus = createEventBus({ clock: () => 10 });
    const systems: Array<{ id: string; update(): void }> = [];
    const handled: MultiplayerMessageEnvelope[] = [];
    const events: string[] = [];
    eventBus.onAny((event) => events.push(event.type));

    const module = createMultiplayerBridgeModule({
      runtime,
      handleCommand({ message }) {
        handled.push(message);
      }
    });

    module.install({
      eventBus,
      systems: {
        register(system) {
          systems.push(system);
        }
      }
    });
    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });

    fake.emit({
      id: "command-1",
      sessionId: "session-1",
      channel: "reliable",
      kind: "game.command",
      sourcePeerId: "client",
      timestamp: 0,
      payload: { action: "move" }
    });

    expect(handled).toEqual([]);
    systems[0]?.update();
    expect(handled.map((message) => message.id)).toEqual(["command-1"]);
    expect(events).toEqual(["multiplayer.command.accepted"]);
  });

  it("emits rejected command facts when authority denies a command", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const eventBus = createEventBus({ clock: () => 10 });
    const systems: Array<{ id: string; update(): void }> = [];
    const events: unknown[] = [];
    eventBus.on("multiplayer.command.rejected", (event) => events.push(event.payload));

    const module = createMultiplayerBridgeModule({
      runtime,
      authority() {
        return { allowed: false, code: "not_authorized", reason: "client cannot act" };
      },
      handleCommand() {
        throw new Error("should not run rejected command");
      }
    });

    module.install({
      eventBus,
      systems: {
        register(system) {
          systems.push(system);
        }
      }
    });
    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });

    fake.emit({
      id: "command-1",
      sessionId: "session-1",
      channel: "reliable",
      kind: "game.command",
      sourcePeerId: "client",
      timestamp: 0,
      payload: { action: "move" }
    });
    systems[0]?.update();

    expect(events).toEqual([
      {
        messageId: "command-1",
        peerId: "client",
        code: "not_authorized",
        reason: "client cannot act"
      }
    ]);
  });
});

type ActionPayload = {
  type: "start";
};

type InputPayload = {
  sequence: number;
  dx: number;
};

type SnapshotPayload = {
  started: boolean;
  x: number;
  tick: number;
};

type FakeBackendHarness = {
  backend: MultiplayerBackendAdapter;
  sent: MultiplayerMessageEnvelope[];
  dropSession(): void;
  emit(message: MultiplayerMessageEnvelope): void;
};

function createFakeBackend(): FakeBackendHarness {
  const listeners = new Set<MultiplayerBackendListener>();
  const sent: MultiplayerMessageEnvelope[] = [];
  let session: MultiplayerSession | undefined;
  const connection: MultiplayerBackendConnection = {
    async createSession(request = {}) {
      const localPeer = {
        id: request.localPeer?.id ?? "host",
        role: request.localPeer?.role ?? "host",
        status: "connected" as const
      };
      session = {
        id: request.id ?? "session",
        kind: request.kind ?? "local",
        authority: request.authority ?? "host-authoritative",
        status: "open",
        peers: [localPeer]
      };
      return session;
    },
    async joinSession() {
      throw new Error("not implemented by fake backend");
    },
    async leaveSession() {
      session = undefined;
    },
    async send(message) {
      sent.push(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
    },
    snapshot() {
      return {
        phase: session ? ("in-session" as const) : ("connected" as const),
        ...(session ? { localPeer: session.peers[0], session } : {}),
        peers: session?.peers ?? [],
        sent: sent.length,
        received: 0
      };
    }
  };

  return {
    sent,
    backend: {
      id: "fake",
      kind: "fake",
      capabilities: {
        channels: [{ id: "reliable", reliability: "reliable", ordering: "ordered" }]
      },
      async connect() {
        return connection;
      },
      snapshot() {
        return {
          id: "fake",
          kind: "fake",
          capabilities: this.capabilities
        };
      }
    },
    dropSession() {
      session = undefined;
    },
    emit(message) {
      for (const listener of Array.from(listeners)) {
        listener(message);
      }
    }
  };
}

function readAction(payload: unknown): ActionPayload | undefined {
  return isRecord(payload) && payload.type === "start" ? { type: "start" } : undefined;
}

function readInput(payload: unknown): InputPayload | undefined {
  if (
    !isRecord(payload) ||
    typeof payload.sequence !== "number" ||
    typeof payload.dx !== "number"
  ) {
    return undefined;
  }

  return {
    sequence: payload.sequence,
    dx: payload.dx
  };
}

function messageFrom(
  sourcePeerId: string,
  kind: string,
  payload: unknown,
  options: { tick?: number } = {}
): MultiplayerMessageEnvelope {
  return {
    id: `${sourcePeerId}.${kind}.${Math.random()}`,
    sessionId: "session-1",
    channel: "reliable",
    kind,
    sourcePeerId,
    timestamp: 100,
    ...(options.tick === undefined ? {} : { tick: options.tick }),
    payload
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 500) {
      throw new Error("Timed out waiting for multiplayer-core condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
