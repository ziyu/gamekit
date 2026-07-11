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
  maxActionsPerSourcePerTick: 4,
  maxQueuedActionsPerSource: 16,
  readInput: decodeInput,
  inputSequence: (input) => input.sequence,
  inputSequenceKey: (input) => input.playerId,
  inputQueueMode: "latest",
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

Discrete `game.action` commands use a per-source bounded FIFO. The host loop defaults to at most 8 actions from one source per authority tick and 32 queued actions per source; apps can tighten those limits with `maxActionsPerSourcePerTick` and `maxQueuedActionsPerSource`. Overflow is rejected as `action-queue-full`, while diagnostics report `queuedActions` and `maxQueuedActions`.

Choose `game.input` queue semantics from the input model. Discrete input samples that must all execute use the default `fifo` mode; `maxInputsPerSourcePerTick: 1` prevents a burst from advancing one player multiple simulation steps inside one authority tick, and `maxQueuedInputsPerSource` bounds hostile or jittery senders. Continuously sampled movement, aim or steering state uses `inputQueueMode: "latest"`: a newer state replaces an older unconsumed state from the same source, queue depth stays bounded by active sources, and diagnostics report `queuedInputs`, `maxQueuedInputs` and `coalescedInputs`. The simulation may hold the last applied state until a newer state or game-owned timeout replaces it. Its acknowledgement advances only after that latest state has been adopted by an authoritative simulation tick; superseded samples need not execute individually.

When presence reports that a peer left or disconnected, the host composition layer must call `loop.releasePeer(peerId)`. The loop then discards that peer's queued actions and inputs and forgets its input sequence keys, so a restored peer can start a fresh input stream without executing pre-disconnect work or being rejected against an old sequence. Player actor, slot and round-stat retention remain game-owned policy.

Offline/local play should use the same action/input, tick, snapshot/apply and diagnostics contract through `createMultiplayerLocalAuthorityLoop()`. The delivery is in-process, but gameplay should not fork into a second single-player-only rule path.

## Snapshot Presentation

Network and authority ticks are often lower than renderer refresh rate. Presentation code should keep authoritative state and display state separate:

```txt
authoritative snapshot
  -> snapshot playback clock and temporal buffer
  -> sample previous / next / alpha for the current render time
  -> declared Network* presentation tracks
  -> presented values
  -> render-only snapshot, renderer objects or UI view model
```

The stable package boundary is a presentation timing and declared-track toolkit, not a backend adapter feature and not a deep object interpolator. Core utilities should stay provider-neutral:

- play short-lived authoritative snapshots by tick, server time or provider version;
- pace render sampling behind the latest authoritative timeline, adapt within configured delay bounds from measured arrival jitter, and clamp under-runs by default;
- report presentation FPS, sample status, current/target interpolation delay, estimated jitter, snapshot age, stale/drop counters and reset diagnostics;
- provide typed interpolation primitives such as number, angle, vector2, vector3, quaternion/slerp and step/snap value;
- expose small network value shapes such as `NetworkScalar`, `NetworkAngleRadians`, `NetworkVector2`, `NetworkVector3`, `NetworkQuaternion`, `NetworkTransform2` and `NetworkTransform3`;
- project declared `Network*` presentation tracks into typed `presented` values;
- reuse projector buffers and direct-write typed values on hot paths;
- leave field selection, track keys, reset policy and render writes to the game or app presentation layer.

Typical app code declares the tracks once, creates a reusable projector, and reads or writes presented values during render projection:

```ts
const playback = createSnapshotPlayback<ArenaSnapshot>({
  interpolationDelayMs: 50,
  adaptiveDelay: {
    minDelayMs: 50,
    maxDelayMs: 150
  },
  readTime: (entry) => entry.snapshot.tick * tickMs
});
const tracks = [
  defineSnapshotVector2Track<ArenaSnapshot>({
    snapDistance: 96,
    selectInto(snapshot, writer) {
      for (const player of snapshot.players) {
        writer.add(`player:${player.id}:position`, player.position);
      }
    }
  })
];
const projector = createSnapshotPresentationProjector(tracks);

const sample = playback.present({ snapshot, tick: snapshot.tick }, renderDeltaMs);
const presented = projector.present(sample);
const player = snapshot.players[0];
presented.vector2Into(`player:${player.id}:position`, renderPlayer.position, player.position);
```

`presentSnapshotTracks()` remains available as a one-shot convenience for tests and small tools. Runtime presentation loops should prefer `createSnapshotPresentationProjector()`, `selectInto()` and `vector2Into()` / `vector3Into()` / `quaternionInto()` so the core can reuse track buffers and caller-owned render targets. Do not rebuild a complete cloned gameplay snapshot on every frame when the renderer can accept direct transform writes.

When the app uses `@gamekit/app-host` standard game modules, the multiplayer module can own the playback loop and declared-track interpolation for the app:

```ts
standardModules: {
  multiplayer: {
    presentation: {
      interpolationDelayMs: 50,
      adaptiveDelay: { minDelayMs: 50, maxDelayMs: 150 },
      readTime: (entry) => entry.snapshot.tick * tickMs,
      tracks,
      readSnapshot: () => latestAuthoritativeSnapshotEntry,
      applySample: ({ presented, snapshot }) => {
        const player = snapshot.players.find((candidate) => candidate.id === renderPlayer.id);
        if (player) {
          presented.vector2Into(
            `player:${renderPlayer.id}:position`,
            renderPlayer.position,
            player.position
          );
        }
      }
    }
  }
}
```

After the first snapshot, `readSnapshot` may return `undefined` on frames where no new authoritative update arrived; the standard module advances the existing playback buffer with the GameRuntime frame delta.

Games should reset snapshot playback when the authority binding, session, snapshot version, hard phase, teleport or resync state changes. `createSnapshotBuffer()` remains available as a low-level escape hatch for custom netcode, but the default path should use `createSnapshotPlayback()` so render pacing, jitter delay, under-run clamping and diagnostics stay in core. Backend packages such as `@gamekit/multiplayer-colyseus` should expose provider state, tick/version source and diagnostics, not hard-code gameplay interpolation policy.

## Client Prediction

Local player prediction is modeled separately from remote interpolation. `createMultiplayerPredictionBuffer()` keeps a bounded input log, applies local inputs immediately, drops inputs acknowledged by the authoritative snapshot, rewinds to the authoritative state and replays still-pending inputs:

```ts
const prediction = createMultiplayerPredictionBuffer({
  initialState: readPlayerPredictionState(snapshot),
  cloneState: (state) => ({ ...state, position: { ...state.position } }),
  applyInput(state, input) {
    return movePredictedPlayer(state, input);
  },
  presentState(fromState, toState, { alpha }) {
    return interpolatePredictedPlayer(fromState, toState, alpha);
  },
  predictionStepMs: 50,
  measureCorrection(previous, next) {
    return distance(previous.position, next.position);
  },
  correctionSmoothing: {
    durationMs: 100,
    maxMagnitude: 48,
    apply(target, { previousPresentedState, initialTargetState, remainingAlpha }) {
      return applyPredictionCorrectionOffset(
        target,
        previousPresentedState,
        initialTargetState,
        remainingAlpha
      );
    }
  }
});

prediction.predict({ sequence: input.sequence, input, timestamp: input.clientTime });
prediction.reconcile({
  authoritativeState: readPlayerPredictionState(authoritativeSnapshot),
  acknowledgedSequence: authoritativeSnapshot.inputAck,
  timestamp: renderFrame.time
});
const renderState = prediction.present({
  deltaMs: renderFrame.deltaMs,
  timestamp: renderFrame.time
});
```

Core owns the input queue, ack handling, replay, bounded fixed-step presentation clock, correction smoothing lifecycle and diagnostics. A predicted command computes the next fixed-step simulation endpoint immediately, while `present()` samples between the previous and current endpoint over `predictionStepMs`; it must not extrapolate again from an endpoint that already represents the end of the step. Reconciliation updates prediction state immediately. Small render corrections are represented as an offset from the corrected moving target and decay over the configured duration, so later prediction steps continue moving at their normal rate. Corrections above `maxMagnitude`, hard resets and teleports still snap. `present()` always works on cloned state, so render sampling never advances authoritative or rollback state. The game still owns deterministic input replay, collision, movement rules, interpolation of its state shape and final render writes.

## Peer / Player Binding

Use `createMultiplayerPeerPlayerBindingStore()` to bind provider peers to app players, display names, slots and active, spectator, next-round or leave states:

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

The helper normalizes and de-duplicates display names per binding set. Configure lifecycle decisions once with `createMultiplayerParticipantPolicy()`. Rules can be static or use app-owned context without teaching core about game phases:

```ts
const participantPolicy = createMultiplayerParticipantPolicy<{
  phase: "lobby" | "running" | "results";
}>({
  join: "active",
  lateJoin: "next-round",
  leave: "remove",
  disconnect: ({ context }) => (context.phase === "lobby" ? "remove" : "disconnected"),
  reconnect: "restore",
  boundary: ({ binding }) =>
    binding.status === "disconnected"
      ? "remove"
      : binding.status === "next-round"
        ? "activate"
        : "retain"
});
```

Core resolves policy decisions and maintains binding vocabulary; the app/server composition layer still applies game-owned actor, slot, team and round-stat changes. Intentional leave and transport disconnect have separate rules even when a particular backend currently reports only generic presence loss.

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

## Benchmarks

Run the module-level benchmark suite when changing multiplayer hot paths:

```bash
corepack pnpm bench:multiplayer
corepack pnpm bench:multiplayer:check
corepack pnpm bench:multiplayer:stability
```

The suite covers envelope normalization, authority receiver source gates, host/local authority loops, latest-input coalescing, prediction reconciliation and render-time presentation, snapshot playback and presentation projection. The regular command remains a profiling trend signal. `bench:multiplayer:check` applies deliberately broad CI ceilings that catch order-of-magnitude regressions, while the stability command simulates 30 minutes of bounded prediction/playback/direct-write activity and checks retained heap after GC.

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
