import { createEventBus } from "@gamekit/event-bus";
import { describe, expect, it } from "vitest";
import {
  createMultiplayerBridgeModule,
  createMultiplayerRuntime,
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

type FakeBackendHarness = {
  backend: MultiplayerBackendAdapter;
  sent: MultiplayerMessageEnvelope[];
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
    emit(message) {
      for (const listener of Array.from(listeners)) {
        listener(message);
      }
    }
  };
}
