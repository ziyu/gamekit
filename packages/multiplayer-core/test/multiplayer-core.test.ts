import { createEventBus } from "@gamekit/event-bus";
import { describe, expect, it } from "vitest";
import {
  createMultiplayerBridgeModule,
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityDiagnostics,
  createMultiplayerAuthorityHostLoop,
  createMultiplayerAuthorityReceiver,
  createMultiplayerLocalAuthorityLoop,
  createMultiplayerPeerPlayerBindingStore,
  createMultiplayerRuntime,
  createMultiplayerSnapshotPresentation,
  createUniqueMultiplayerDisplayName,
  MULTIPLAYER_ACTION_KIND,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_PATCH_KIND,
  MULTIPLAYER_RESULT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND,
  multiplayerErrorCodes,
  normalizeMultiplayerDisplayName,
  type MultiplayerBackendAdapter,
  type MultiplayerBackendConnection,
  type MultiplayerBackendListener,
  type MultiplayerMessageEnvelope,
  type MultiplayerPeer,
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

  it("rejects reconnect with a stable unsupported capability error", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });

    await expect(runtime.reconnect?.()).rejects.toMatchObject({
      code: multiplayerErrorCodes.unsupportedCapability,
      details: {
        backendId: "fake",
        capability: "reconnect"
      }
    });
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

  it("applies patches and results only from the bound authority source", async () => {
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
    let latestPatch: { dx: number } | undefined;
    let latestResult: { accepted: boolean } | undefined;
    const receiver = createMultiplayerAuthorityReceiver<
      { x: number },
      { dx: number },
      { accepted: boolean }
    >({
      runtime,
      binding,
      readSnapshot(payload) {
        return isRecord(payload) && typeof payload.x === "number" ? { x: payload.x } : undefined;
      },
      readPatch(payload) {
        return isRecord(payload) && typeof payload.dx === "number" ? { dx: payload.dx } : undefined;
      },
      readResult(payload) {
        return isRecord(payload) && typeof payload.accepted === "boolean"
          ? { accepted: payload.accepted }
          : undefined;
      },
      applySnapshot() {
        // This test focuses on patch/result source gates.
      },
      applyPatch(patch) {
        latestPatch = patch;
      },
      applyResult(result) {
        latestResult = result;
      }
    });

    fake.emit(messageFrom("client", MULTIPLAYER_PATCH_KIND, { dx: 99 }));
    fake.emit(messageFrom("host", MULTIPLAYER_PATCH_KIND, { dx: 2 }, { tick: 5 }));
    fake.emit(messageFrom("client", MULTIPLAYER_RESULT_KIND, { accepted: false }));
    fake.emit(messageFrom("host", MULTIPLAYER_RESULT_KIND, { accepted: true }, { tick: 6 }));

    expect(latestPatch).toEqual({ dx: 2 });
    expect(latestResult).toEqual({ accepted: true });
    expect(receiver.diagnostics()).toMatchObject({
      receivedPatches: 2,
      appliedPatches: 1,
      receivedResults: 2,
      appliedResults: 1,
      rejectedMessages: 2,
      lastAppliedTick: 6,
      lastRejected: {
        code: "non-authority-source",
        sourcePeerId: "client",
        kind: MULTIPLAYER_RESULT_KIND
      }
    });
    expect(binding.current()).toMatchObject({ tick: 6 });
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

  it("summarizes authority state without provider handles or payloads", () => {
    const bindingStore = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      status: "resyncing",
      authorityPeerId: "host",
      authorityEndpoint: { kind: "peer", id: "host-endpoint", peerId: "host" },
      localPlayerId: "player-client",
      tick: 4,
      snapshotVersion: "state.v1"
    });

    const diagnostics = createMultiplayerAuthorityDiagnostics({
      binding: bindingStore.current(),
      loop: {
        tick: 5,
        receivedActions: 2,
        acceptedActions: 1,
        rejectedActions: 1,
        receivedInputs: 3,
        acceptedInputs: 2,
        rejectedInputs: 1,
        sentSnapshots: 4,
        rejectedMessages: 2,
        lastRejected: { code: "stale-input", reason: "Input was stale." },
        lastBroadcastError: "transport closed"
      },
      receiver: {
        receivedSnapshots: 3,
        appliedSnapshots: 2,
        receivedPatches: 1,
        appliedPatches: 1,
        receivedResults: 1,
        appliedResults: 1,
        rejectedMessages: 1,
        lastAppliedTick: 4,
        lastSnapshotAgeMs: 25,
        lastRejected: {
          code: "non-authority-source",
          reason: "Rejected non-authority source.",
          sourcePeerId: "client"
        }
      },
      connection: {
        status: "closed",
        reason: "host-left",
        reconnectSupported: false,
        reconnectReason: "unsupported"
      }
    });

    expect(diagnostics).toMatchObject({
      sessionId: "session-1",
      mode: "host-authoritative",
      status: "resyncing",
      authoritativePath: "gamekit-envelope",
      resyncing: true,
      authorityPeerId: "host",
      localPlayerId: "player-client",
      tick: 4,
      snapshotVersion: "state.v1",
      receivedActions: 2,
      acceptedInputs: 2,
      sentSnapshots: 4,
      receivedSnapshots: 3,
      appliedPatches: 1,
      rejectedMessages: 3,
      lastAppliedTick: 4,
      lastSnapshotAgeMs: 25,
      lastRejected: {
        code: "non-authority-source",
        sourcePeerId: "client"
      },
      lastBroadcastError: "transport closed",
      connection: {
        status: "closed",
        reconnectSupported: false
      }
    });

    diagnostics.binding.status = "closed";
    expect(bindingStore.current().status).toBe("resyncing");
  });
});

describe("peer/player binding utility", () => {
  it("binds peers to unique player display names and cleans up leave state", () => {
    const store = createMultiplayerPeerPlayerBindingStore({
      displayNameFallback(_peer, index) {
        return `Player ${index}`;
      }
    });

    const alpha = store.bindPeer(peer("peer-a", { playerId: "player-a", displayName: " Scout " }));
    const bravo = store.bindPeer(peer("peer-b", { playerId: "player-b", displayName: "Scout" }));
    const charlie = store.bindPeer(peer("peer-c", { playerId: "player-c", displayName: "   " }));

    expect(alpha).toMatchObject({ playerId: "player-a", displayName: "Scout" });
    expect(bravo).toMatchObject({ playerId: "player-b", displayName: "Scout 2" });
    expect(charlie).toMatchObject({ playerId: "player-c", displayName: "Player 3" });
    expect(store.playerIdForPeer("peer-b")).toBe("player-b");
    expect(store.activeBindings().map((binding) => binding.playerId)).toEqual([
      "player-a",
      "player-b",
      "player-c"
    ]);

    const left = store.markPeerLeft("peer-b", {
      status: "disconnected",
      reason: "tab closed"
    });

    expect(left).toMatchObject({
      playerId: "player-b",
      status: "disconnected",
      reason: "tab closed"
    });
    expect(store.playerIdForPeer("peer-b")).toBeUndefined();
    expect(store.activeBindings().map((binding) => binding.playerId)).toEqual([
      "player-a",
      "player-c"
    ]);

    const restored = store.bindPeer(
      peer("peer-d", { playerId: "player-b", displayName: "Scout" }),
      { slot: "blue" }
    );
    expect(restored).toMatchObject({
      peerId: "peer-d",
      playerId: "player-b",
      displayName: "Scout 2",
      status: "active",
      slot: "blue"
    });

    const removed = store.markPeerLeft("peer-c", { remove: true });
    expect(removed).toMatchObject({ playerId: "player-c", status: "left" });
    expect(store.bindings().map((binding) => binding.playerId)).toEqual(["player-a", "player-b"]);
  });

  it("supports spectator bindings and closes a binding set", () => {
    const store = createMultiplayerPeerPlayerBindingStore();

    store.bindPeer(peer("peer-a", { playerId: "player-a", role: "host" }));
    store.bindPeer(peer("peer-s", { playerId: "spectator-a", role: "spectator" }));

    expect(store.bindings()).toEqual([
      expect.objectContaining({ playerId: "player-a", status: "active" }),
      expect.objectContaining({ playerId: "spectator-a", status: "spectator" })
    ]);
    expect(store.activeBindings().map((binding) => binding.playerId)).toEqual(["player-a"]);

    const closed = store.close("room closed");
    expect(closed).toEqual([
      expect.objectContaining({ playerId: "player-a", status: "closed", reason: "room closed" }),
      expect.objectContaining({
        playerId: "spectator-a",
        status: "closed",
        reason: "room closed"
      })
    ]);
    expect(store.activeBindings()).toEqual([]);
    expect(() => store.bindPeer(peer("peer-b"))).toThrowErrorMatchingInlineSnapshot(
      `[GameError: Peer/player binding store is closed.]`
    );
  });

  it("normalizes and de-duplicates display names", () => {
    expect(normalizeMultiplayerDisplayName("  Alpha   Bravo  ", "Fallback")).toBe("Alpha Bravo");
    expect(normalizeMultiplayerDisplayName("   ", "Fallback")).toBe("Fallback");
    expect(createUniqueMultiplayerDisplayName("Scout", ["Scout", "Scout 2"])).toBe("Scout 3");
  });
});

describe("createMultiplayerSnapshotPresentation", () => {
  it("smooths selected snapshot samples without owning game state shape", () => {
    type Snapshot = {
      tick: number;
      units: Array<{ id: string; position: { x: number; y: number } }>;
    };
    const presentation = createMultiplayerSnapshotPresentation<Snapshot>({
      smoothingMs: 80,
      snapDistance: 1000,
      selectSamples(snapshot) {
        return snapshot.units.map((unit) => ({
          key: unit.id,
          target: unit.position
        }));
      },
      applyPresentedSnapshot({ snapshot, presented }) {
        return {
          ...snapshot,
          units: snapshot.units.map((unit) => ({
            ...unit,
            position: { ...(presented.get(unit.id) ?? unit.position) }
          }))
        };
      }
    });

    const first = presentation.present(
      { tick: 1, units: [{ id: "unit-a", position: { x: 10, y: 0 } }] },
      16
    );
    const second = presentation.present(
      { tick: 2, units: [{ id: "unit-a", position: { x: 58, y: 0 } }] },
      16
    );
    const third = presentation.present(
      { tick: 2, units: [{ id: "unit-a", position: { x: 58, y: 0 } }] },
      16
    );

    expect(first.units[0]?.position).toEqual({ x: 10, y: 0 });
    expect(second.units[0]?.position.x).toBeGreaterThan(10);
    expect(second.units[0]?.position.x).toBeLessThan(58);
    expect(third.units[0]?.position.x).toBeGreaterThan(second.units[0]?.position.x ?? 0);
    expect(presentation.diagnostics()).toMatchObject({
      activeSamples: 1,
      resets: 0,
      lastDeltaMs: 16
    });
  });

  it("removes inactive samples from presentation state", () => {
    type Snapshot = {
      units: Array<{ id: string; position: { x: number; y: number } }>;
    };
    const presentation = createMultiplayerSnapshotPresentation<Snapshot>({
      selectSamples(snapshot) {
        return snapshot.units.map((unit) => ({
          key: unit.id,
          target: unit.position
        }));
      },
      applyPresentedSnapshot({ snapshot, presented }) {
        return {
          units: snapshot.units.map((unit) => ({
            ...unit,
            position: { ...(presented.get(unit.id) ?? unit.position) }
          }))
        };
      }
    });

    presentation.present(
      {
        units: [
          { id: "unit-a", position: { x: 0, y: 0 } },
          { id: "unit-b", position: { x: 100, y: 0 } }
        ]
      },
      16
    );
    presentation.present({ units: [{ id: "unit-a", position: { x: 10, y: 0 } }] }, 16);

    expect(presentation.diagnostics().activeSamples).toBe(1);
  });

  it("lets games reset presentation state and force snap individual samples", () => {
    type Snapshot = {
      epoch: number;
      units: Array<{ id: string; teleport?: boolean; position: { x: number; y: number } }>;
    };
    const presentation = createMultiplayerSnapshotPresentation<Snapshot>({
      smoothingMs: 80,
      snapDistance: 1000,
      shouldReset(previous, next) {
        return previous !== undefined && previous.epoch !== next.epoch;
      },
      selectSamples(snapshot) {
        return snapshot.units.map((unit) => ({
          key: unit.id,
          target: unit.position,
          snap: unit.teleport === true
        }));
      },
      applyPresentedSnapshot({ snapshot, presented }) {
        return {
          ...snapshot,
          units: snapshot.units.map((unit) => ({
            ...unit,
            position: { ...(presented.get(unit.id) ?? unit.position) }
          }))
        };
      }
    });

    presentation.present({ epoch: 1, units: [{ id: "unit-a", position: { x: 0, y: 0 } }] }, 16);
    const teleported = presentation.present(
      { epoch: 1, units: [{ id: "unit-a", teleport: true, position: { x: 100, y: 0 } }] },
      16
    );
    const reset = presentation.present(
      { epoch: 2, units: [{ id: "unit-a", position: { x: 200, y: 0 } }] },
      16
    );

    expect(teleported.units[0]?.position).toEqual({ x: 100, y: 0 });
    expect(reset.units[0]?.position).toEqual({ x: 200, y: 0 });
    expect(presentation.diagnostics().resets).toBe(1);
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

function peer(
  id: string,
  options: Partial<Omit<MultiplayerPeer, "id" | "status">> & {
    status?: MultiplayerPeer["status"];
  } = {}
): MultiplayerPeer {
  return {
    id,
    status: options.status ?? "connected",
    ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.playerId === undefined ? {} : { playerId: options.playerId }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
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
