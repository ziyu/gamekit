# @gamekit/multiplayer-core

Provider-neutral multiplayer facade, authority helpers and conformance tools for GameKit.

`multiplayer-core` defines the stable GameKit boundary for session summaries, peers, semantic envelopes, authority decisions, replication helpers, peer/player binding and diagnostics. It does not implement a production room server, matchmaking, reconnect engine, presence store or provider-native state sync. Real backends live in packages such as `@gamekit/multiplayer-colyseus`.

## Runtime

```ts
import { createMultiplayerRuntime } from "@gamekit/multiplayer-core";
import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";

const multiplayer = createMultiplayerRuntime({
  id: "arena.client",
  backend: createMemoryMultiplayerBackend(),
  connectContext: {
    localPeer: { id: "client-a", playerId: "player-a", role: "client" }
  }
});

await multiplayer.joinSession({
  sessionId: "arena-session",
  localPeer: { id: "client-a", playerId: "player-a", role: "client" }
});
```

`createSession`, `joinSession`, `leaveSession`, `send`, `subscribe`, `peers`, `session`, `localPeer` and `snapshot` are provider-neutral. `reconnect()` is currently visible but unsupported in the core runtime; it rejects with `MULTIPLAYER_UNSUPPORTED_CAPABILITY` unless a future backend-specific facade explicitly implements reconnect semantics.

## Authority Contract

Connected, joined or peer count only proves presence. Gameplay state is valid only after the app creates an authority binding:

```ts
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityReceiver
} from "@gamekit/multiplayer-core";

const binding = createMultiplayerAuthorityBindingStore({
  sessionId: "arena-session",
  mode: "host-authoritative",
  authorityPeerId: "host",
  localPlayerId: "player-a"
});

createMultiplayerAuthorityReceiver({
  runtime: multiplayer,
  binding,
  readSnapshot: decodeArenaSnapshot,
  applySnapshot(snapshot) {
    renderArena(snapshot);
  }
});
```

The standard kinds are `game.action`, `game.input`, `game.snapshot`, `game.patch` and `game.result`. Snapshot, patch and result receivers reject messages from non-bound authority sources and record the rejection in diagnostics.

## Host And Local Authority

Host/server authority processes untrusted action/input payloads at a tick boundary:

```ts
import { createMultiplayerAuthorityHostLoop } from "@gamekit/multiplayer-core";

const loop = createMultiplayerAuthorityHostLoop({
  runtime: hostRuntime,
  binding: hostBinding,
  readInput: decodeInput,
  inputSequence: (input) => input.sequence,
  inputSequenceKey: (input) => input.playerId,
  handleInput({ payload, message }) {
    if (payload.playerId !== message.sourcePeerId) {
      return { allowed: false, code: "player-source-mismatch", reason: "Bad source." };
    }
    applyInput(payload);
  },
  captureSnapshot({ tick }) {
    return captureArenaSnapshot(tick);
  }
});
```

Offline/local play should use the same action/input, tick, snapshot/apply and diagnostics contract through `createMultiplayerLocalAuthorityLoop()`. The delivery is in-process, but gameplay should not fork into a second single-player-only rule path.

## Peer / Player Binding

Use `createMultiplayerPeerPlayerBindingStore()` to bind provider peers to app players, display names, slots and spectator/leave states:

```ts
const players = createMultiplayerPeerPlayerBindingStore();

players.bindPeer({
  id: "peer-a",
  playerId: "player-a",
  displayName: "Scout",
  status: "connected"
});

players.markPeerLeft("peer-a", { status: "left", reason: "tab closed" });
players.close("room closed");
```

The helper normalizes and de-duplicates display names per binding set. It does not decide game-specific late-join policy; apps still choose whether a late peer becomes an active player, spectator, next-round participant or rejected join.

## Diagnostics

`createMultiplayerAuthorityDiagnostics()` combines authority binding, host/local loop counters, receiver counters and redacted connection summary:

```ts
const summary = createMultiplayerAuthorityDiagnostics({
  binding: binding.current(),
  authoritativePath: "gamekit-envelope",
  loop: hostLoop.diagnostics(),
  receiver: clientReceiver.diagnostics(),
  connection: { reconnectSupported: false, reconnectReason: "unsupported" }
});
```

Diagnostics intentionally exclude provider handles, sockets, room objects, secrets, tokens and full high-frequency payloads.

## App Host Integration

`@gamekit/app-host` can own a multiplayer runtime as an optional standard service and install the standard GameModule bridge:

```ts
const profile = createStandardAppProfile({
  multiplayer: {
    runtime: multiplayerRuntime
  },
  game: {
    createRuntime,
    standardModules: {
      multiplayer: {
        handleCommand({ message }) {
          handleGameCommand(message);
        }
      }
    }
  }
});
```

App Host owns connection lifecycle and service disposal. The GameModule bridge only handles normalized messages at the GameRuntime tick boundary; it does not create rooms or sockets.

## Conformance

Backend packages should run both conformance helpers:

```ts
await runMultiplayerBackendConformance({ createBackend });
await runMultiplayerAuthorityConformance({ createBackend });
```

The authority conformance runner verifies shared host-authoritative state, local authority equivalence, non-authority snapshot/patch/result rejection, duplicate input rejection, session isolation and client leave cleanup.
