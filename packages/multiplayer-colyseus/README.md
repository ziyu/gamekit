# @gamekit/multiplayer-colyseus

Colyseus backend adapter for GameKit Multiplayer.

This package connects Colyseus Room / client lifecycle to GameKit's multiplayer facade and GameModule bridge. Colyseus owns the mature multiplayer runtime: room creation, room membership, message transport, state synchronization, reconnection behavior, server-side lifecycle, load testing, and provider diagnostics. GameKit owns the stable integration boundary: semantic command envelopes, App Host service lifecycle, GameRuntime tick-boundary command handling, redacted snapshots, and provider-neutral diagnostics.

Long-term design sources:

- `docs/modules/multiplayer.md`
- `docs/adr/0012-mature-multiplayer-backend-adapter.md`
- `docs/implementation/multiplayer-demo-validation.md`

## Responsibilities

This package is responsible for:

- Creating a GameKit `MultiplayerBackendAdapter` backed by a Colyseus client.
- Mapping Colyseus room lifecycle to GameKit session, peer, phase, and diagnostics snapshots.
- Sending and receiving GameKit semantic message envelopes through Colyseus room messages.
- Providing opt-in provider-native capability bridges for Colyseus Schema state sync, room metadata, reconnect / seat reservation summaries, and provider diagnostics.
- Providing server-only helpers for local Colyseus test/demo servers.
- Providing a typed native bridge for app-specific tooling that explicitly opts into Colyseus types.
- Keeping Colyseus Room, Client, Schema, matchmaker, reconnection token, socket, and server objects out of `@gamekit/multiplayer-core`, gameplay modules, DataType, Save payloads, and reusable GameModule public APIs.

This package is not responsible for:

- Reimplementing Colyseus rooms, matchmaking, reconnection, presence, transport, or state sync.
- Providing production account, auth, invitation, friends, lobby UI, NAT traversal, or deployment orchestration.
- Defining Tiny Camp or any other app-specific command payload as a core type.
- Letting Renderer, Input, UI, TCA, GAS, Save, or gameplay systems call Colyseus directly.
- Saving live room handles, sockets, reconnection tokens, auth tokens, message queues, or transient presence.

## Package Shape

The root entry is safe for app/client composition and should not export server-only Colyseus types:

```ts
import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import { createMultiplayerRuntime } from "@gamekit/multiplayer-core";

const backend = createColyseusMultiplayerBackend({
  endpoint: "http://localhost:2567",
  roomName: "tiny_camp"
});

const multiplayer = createMultiplayerRuntime({
  id: "sandbox.multiplayer",
  backend,
  connectContext: {
    localPeer: { id: "player.local", role: "client" }
  }
});
```

The server entry is server-only and may expose Colyseus Room / server harness helpers:

```ts
import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";

const server = await createGameKitColyseusServer({
  rooms: {
    tiny_camp: createTinyCampRoomDefinition()
  }
});
```

The root entry must not re-export `Room`, `Client`, `Schema`, server transports, or test server helpers. Server-side exports must stay behind `@gamekit/multiplayer-colyseus/server` or app-specific server packages.

## Capability Lanes

Colyseus should not be reduced to a generic message transport. The adapter supports two complementary lanes:

| Lane             | Purpose                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GameKit envelope | Cross-backend baseline for `game.action`, `game.input`, `game.snapshot`, `game.patch`, results, authority source gate and conformance. |
| Colyseus native  | Opt-in use of Colyseus Schema / state sync, room metadata, reconnect / seat reservation, matchmaker and provider diagnostics.          |

An app may choose either lane as the authoritative state writer for a room, but it must not let both lanes write the same gameplay state. The active lane must be reflected in GameKit authority binding / diagnostics so UI and DevTools can explain the current source of truth.

Provider-native bridge rules:

- Colyseus Schema, Room, Client and server runtime types may appear only in this package, its server subpath, or app-specific server/tooling code that explicitly imports the native bridge.
- Native state sync must map back to provider-neutral authority diagnostics such as source, tick/version, snapshot age, resync reason, rejected source and state size.
- Browser gameplay and reusable GameModules should consume app-local snapshots or view models, not raw Colyseus Schema instances.
- Reconnect / seat reservation tokens and room secrets must stay inside provider-specific code and must not enter Save payloads or public diagnostics.

## Dependency Policy

Expected dependency ownership:

| Area           | Allowed dependencies                              | Notes                                                        |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Root adapter   | `@gamekit/multiplayer-core`, Colyseus client SDK  | Browser/client-facing integration only.                      |
| Server subpath | Colyseus server packages, Colyseus schema package | Server-only exports and local test/demo harnesses.           |
| Tests          | Vitest, Colyseus local server harness             | Must clean up ports, rooms, listeners, and pending messages. |

Colyseus SDK types can appear in `@gamekit/multiplayer-colyseus` public native bridge types, but not in `@gamekit/multiplayer-core`, app gameplay modules, Data definitions, Save contributors, or provider-neutral DevTools sources.

## Session Mapping

The adapter maps Colyseus concepts into provider-neutral GameKit summaries:

| GameKit concept     | Colyseus source                             | Notes                                                                                 |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `backend.id`        | Adapter option                              | Stable id such as `colyseus` or `colyseus:sandbox`.                                   |
| `session.id`        | Room id                                     | Do not expose the Room object in snapshots.                                           |
| `session.kind`      | Room metadata / adapter option              | Examples: `private`, `public`, `matchmade`, `local-dev`.                              |
| `session.authority` | Adapter option / room metadata              | Common first demo value: `host-authoritative` or `server-authoritative`.              |
| `peer.id`           | Colyseus session id or app-provided peer id | Prefer stable app-provided id when available.                                         |
| `peer.playerId`     | App/account metadata                        | Do not infer from secrets or tokens.                                                  |
| `phase`             | Client/room lifecycle                       | Normalize to GameKit phases such as `connecting`, `in-session`, `closed`, `disposed`. |

Current `multiplayer-core` exposes `createSession()` and `joinSession()`. A Colyseus adapter can map them to Colyseus room operations as follows:

| GameKit call                      | Colyseus behavior                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `createSession({ id, ... })`      | `joinOrCreate(roomName, options)` and treat the returned Room id as the session id.  |
| `joinSession({ sessionId, ... })` | Join by Room id when available, or join/create by room name for local demo profiles. |
| `leaveSession(reason)`            | `room.leave()` plus redacted close/leave diagnostics.                                |
| `send(envelope)`                  | `room.send(messageType, envelope)` with validation and size checks.                  |
| `subscribe(listener)`             | Subscribe to normalized room messages and state summary updates.                     |
| `snapshot()`                      | Return GameKit-safe summaries only.                                                  |

When `multiplayer-core` converges on a `createOrJoinSession()` facade, this package should collapse the create/join distinction at the adapter boundary without changing gameplay command contracts.

For `host-authoritative` rooms, the peer with `role: "host"` is the authority owner. When that peer leaves, the server room closes and remaining clients are disconnected instead of leaving an orphan room that can still accept late clients. Ordinary client leave only updates presence and leaves the room open.

## Message Mapping

GameKit message envelopes stay provider-neutral:

```ts
type GameKitColyseusMessage = {
  id: string;
  sessionId: string;
  channel: string;
  kind: string;
  sourcePeerId: string;
  targetPeerIds?: string[];
  sequence?: number;
  tick?: number;
  schemaVersion?: string;
  correlationId?: string;
  timestamp: number;
  payload: unknown;
};
```

Recommended Colyseus message types:

| Colyseus message type    | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `gamekit.message`        | Provider-neutral GameKit semantic envelope.               |
| `gamekit.command.result` | Low-frequency accepted/rejected command result summary.   |
| `gamekit.state.summary`  | Redacted provider-neutral state summary for HUD/DevTools. |
| `gamekit.diagnostic`     | Low-frequency backend diagnostic event.                   |

`targetPeerIds` is interpreted by the server helper or app-specific Room. The root adapter should not assume every provider has identical targeted-message semantics.

Remote payload is always untrusted. The adapter or Room helper must validate:

- Message shape and required envelope fields.
- Supported `kind`, `channel`, and `schemaVersion`.
- Payload size.
- Target peer existence.
- Sender peer identity.
- Optional app-provided command schema.

## Server Room Contract

The generic server helpers should provide Colyseus integration without importing app gameplay:

- Define a reusable Room base/helper that accepts GameKit envelope messages.
- Normalize join, leave, drop, reconnect, and close events into provider-neutral summaries.
- Optionally expose a state-summary hook for DevTools/HUD snapshots.
- Allow an app-specific room to attach a headless GameRuntime or host-authoritative command handler.
- Keep app command decoders and authority policy outside `@gamekit/multiplayer-core`.

Tiny Camp's Colyseus Room belongs in Sandbox app/server code or a Sandbox-specific helper. This package may provide the reusable Colyseus bridge it uses, but it must not export Tiny Camp worker/building/monster command types from the adapter root.

## Diagnostics

Snapshots and diagnostics should answer:

- Backend id, room name, room id, phase, authority mode.
- Local peer and connected peer summaries.
- Sent/received message counts.
- Last connect, join, leave, drop, reconnect, and close reasons.
- Invalid message counts and rejection reasons.
- Redacted command result summary.
- Optional provider-native details only through an explicit native bridge.

Diagnostics must not include:

- Auth token, room secret, reconnection token, invite code, raw IP, socket object, Room object, Client object, full high-frequency payload, or Colyseus Schema instances.

## Native Bridge

The package may expose an explicit native bridge for advanced app/tooling code:

```ts
const native = backend.native?.();
```

Native bridge usage rules:

- It is an escape hatch, not the default gameplay path.
- It can expose Colyseus client/server handles only from this adapter package or a server-only subpath.
- It must never enter Save payloads, DataType definitions, reusable GameModule public APIs, or provider-neutral DevTools sources.
- DevTools must label native/provider-specific details as Colyseus-specific.

The root adapter exposes a typed native bridge from `createColyseusMultiplayerBackend()`:

```ts
import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import { createMultiplayerAuthorityBindingStore } from "@gamekit/multiplayer-core";

const backend = createColyseusMultiplayerBackend({
  endpoint: "http://localhost:2567",
  roomName: "relay_arena",
  nativeCapabilities: {
    authoritativePath: "colyseus-schema",
    stateSync: {
      available: true,
      lane: "colyseus-schema",
      schemaVersion: "arena.v1"
    }
  }
});

const binding = createMultiplayerAuthorityBindingStore({
  sessionId: "relay-arena-session",
  mode: "server-authoritative",
  authorityEndpoint: {
    kind: "server",
    id: "colyseus-schema"
  }
});

const stateBridge = backend.native().createStateBridge({
  binding,
  authoritativePath: "colyseus-schema",
  sourceEndpointId: "colyseus-schema",
  readState(state) {
    return typeof state === "object" && state !== null ? state : undefined;
  },
  applyState(state, ctx) {
    // Map provider-native state into an app-owned view model here.
    console.log(ctx.tick, state);
  }
});
```

The bridge records provider-neutral diagnostics for state version, tick, source endpoint, state size, resync and rejected updates. It does not make Colyseus Schema a `multiplayer-core` type.

## App Host Integration

App profiles should create the Colyseus backend as an App Service dependency:

```ts
const multiplayerBackend = createColyseusMultiplayerBackend({
  endpoint: config.multiplayer.endpoint,
  roomName: config.multiplayer.roomName
});
```

`services.multiplayer` exposes the GameKit facade. `profile.standard.game.standardModules.multiplayer` installs the GameModule bridge that processes incoming commands at the GameRuntime tick boundary.

The bridge consumes only normalized GameKit messages. It does not import Colyseus, hold a Room handle, or call the Colyseus SDK.

## Sandbox Demo Contract

The first visible demo is `Tiny Camp Colyseus Co-op Loopback`.

Acceptance criteria:

- A local Colyseus server starts for tests/dev.
- Host/server and client join the same Colyseus Room.
- At least one Tiny Camp command travels through Colyseus Room messaging.
- The host/server authority boundary validates and applies the command on a GameRuntime tick.
- The result is broadcast as a redacted command result or state summary.
- HUD and DevTools show backend, room, peers, message counts, and last command result.
- Sandbox gameplay code does not import Colyseus types.
- Save payloads do not include live Colyseus state.

## Verification

Package-level verification should include:

```bash
corepack pnpm --filter @gamekit/multiplayer-colyseus test
corepack pnpm --filter @gamekit/multiplayer-colyseus build
corepack pnpm --filter @gamekit/multiplayer-colyseus lint
```

Repository gate before merging related implementation:

```bash
corepack pnpm test
corepack pnpm build
corepack pnpm lint
corepack pnpm format
git diff --check
```

Tests should cover:

- Core backend conformance where Colyseus supports the capability.
- Join/create, leave, close, dispose cleanup.
- Broadcast and targeted command routing.
- Invalid message and payload size handling.
- Drop/reconnect summary when enabled.
- Redaction of diagnostics and snapshots.
- Local server harness cleanup with dynamic ports.

## References

- Colyseus documentation: https://docs.colyseus.io/
- GameKit Multiplayer design: `docs/modules/multiplayer.md`
- Mature backend decision: `docs/adr/0012-mature-multiplayer-backend-adapter.md`
