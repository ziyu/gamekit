# @gamekit/multiplayer-core

## 0.1.0-alpha.4

### Minor Changes

- 116b3bd: Add App Host standard Physics module composition, expose the core-owned canonical Multiplayer GameModule factory, and preserve project-reference-compatible declarations for the multi-entry Colyseus adapter.

### Patch Changes

- d2d3825: Bound host authority action processing with configurable per-source tick and queue limits, expose action queue diagnostics, and reject overflow with a stable error code.
- 7d88257: Add an authority host-loop peer release hook that clears disconnected peers' queued work and input sequence state, plus a configurable participant lifecycle policy resolver and standard next-round binding status for join, leave, disconnect, reconnect and round-boundary composition.
- 63c2214: Allow authority host loops to publish captured snapshots through a provider-native state writer while preserving the standard tick, diagnostics, and error boundary.
- cf78f3f: Add a provider-neutral client prediction buffer with bounded pending input replay, authoritative reconciliation, fixed-step presentation sampling, moving-target correction decay and diagnostics; add bounded FIFO and latest-per-source authority input queue modes with queue/coalescing diagnostics; and extend snapshot playback with bounded adaptive jitter delay diagnostics.
- 42c830b: Add provider-neutral temporal snapshot playback, standard multiplayer presentation module binding, reusable presentation projectors, declared Network presentation tracks, typed interpolation primitives and small Network value shapes outside backend adapters.
- c2b4371: Add the first reusable multiplayer authority baseline with provider-neutral diagnostics, peer/player binding utilities, result receiver source gates, expanded backend conformance, reconnect unsupported semantics, and package documentation.
  - @gamekit/core@0.1.0-alpha.5
  - @gamekit/event-bus@0.1.0-alpha.5

## 0.1.0-alpha.3

Initial multiplayer core package.
