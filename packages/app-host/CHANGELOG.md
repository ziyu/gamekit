# @gamekit/app-host

## 0.1.0-alpha.8

### Patch Changes

- 0326356: Add scoped assets and transactional save recovery
- Updated dependencies [0326356]
  - @gamekit/asset@0.1.0-alpha.8
  - @gamekit/save@0.1.0-alpha.8
  - @gamekit/animator-core@0.1.0-alpha.8
  - @gamekit/audio-core@0.1.0-alpha.8
  - @gamekit/ai-core@0.1.0-alpha.8
  - @gamekit/combat@0.1.0-alpha.8
  - @gamekit/gas@0.1.0-alpha.8
  - @gamekit/physics-core@0.1.0-alpha.8
  - @gamekit/tca@0.1.0-alpha.8
  - @gamekit/core@0.1.0-alpha.8
  - @gamekit/world@0.1.0-alpha.8
  - @gamekit/platform-core@0.1.0-alpha.8
  - @gamekit/renderer-core@0.1.0-alpha.8
  - @gamekit/game-runtime@0.1.0-alpha.8
  - @gamekit/data@0.1.0-alpha.8
  - @gamekit/input-core@0.1.0-alpha.8
  - @gamekit/camera-core@0.1.0-alpha.8
  - @gamekit/driver-core@0.1.0-alpha.8
  - @gamekit/devtools@0.1.0-alpha.8
  - @gamekit/ui-core@0.1.0-alpha.8
  - @gamekit/multiplayer-core@0.1.0-alpha.8
  - @gamekit/navigation-core@0.1.0-alpha.8

## 0.1.0-alpha.7

### Minor Changes

- ce209d8: Add provider-neutral client prediction domains, bounded redundant fixed-step input delivery, deterministic network-condition simulation, and the standard full-island multiplayer Physics Arena prediction and authority projection workflow.

### Patch Changes

- 398165e: Fix runtime failure and persistence contracts
- Updated dependencies [398165e]
- Updated dependencies [ce209d8]
  - @gamekit/asset@0.1.0-alpha.7
  - @gamekit/game-runtime@0.1.0-alpha.7
  - @gamekit/gas@0.1.0-alpha.7
  - @gamekit/input-core@0.1.0-alpha.7
  - @gamekit/platform-core@0.1.0-alpha.7
  - @gamekit/save@0.1.0-alpha.7
  - @gamekit/tca@0.1.0-alpha.7
  - @gamekit/multiplayer-core@0.1.0-alpha.7
  - @gamekit/physics-core@0.1.0-alpha.7
  - @gamekit/animator-core@0.1.0-alpha.7
  - @gamekit/audio-core@0.1.0-alpha.7
  - @gamekit/ai-core@0.1.0-alpha.7
  - @gamekit/combat@0.1.0-alpha.7
  - @gamekit/navigation-core@0.1.0-alpha.7
  - @gamekit/core@0.1.0-alpha.7
  - @gamekit/world@0.1.0-alpha.7
  - @gamekit/renderer-core@0.1.0-alpha.7
  - @gamekit/data@0.1.0-alpha.7
  - @gamekit/camera-core@0.1.0-alpha.7
  - @gamekit/driver-core@0.1.0-alpha.7
  - @gamekit/devtools@0.1.0-alpha.7
  - @gamekit/ui-core@0.1.0-alpha.7

## 0.1.0-alpha.6

### Minor Changes

- c6fdda9: Add standard Combat, Navigation, AI, and Animator game-module composition, a domain-specific GameAudio app service, live gameplay trace/diagnostic correlation observers with bounded source/playback summaries, gameplay DevTools source kinds, and shared facade conformance fixture exports.
- c73f533: Add a Core-managed client replication runtime that automatically coordinates authoritative snapshot playback, declared remote presentation tracks, local input prediction, acknowledgement reconciliation, correction smoothing, binding resets, and lifecycle cleanup through the standard Multiplayer GameModule configuration.

### Patch Changes

- c73f533: Expose reusable headless renderer and memory asset fixtures, and add an isolated memory PlatformRuntime factory for non-visual AppProfile composition.
- Updated dependencies [c6fdda9]
- Updated dependencies [c6fdda9]
- Updated dependencies [c6fdda9]
- Updated dependencies [16bf100]
- Updated dependencies [c6fdda9]
- Updated dependencies [16bf100]
- Updated dependencies [c73f533]
- Updated dependencies [c6fdda9]
- Updated dependencies [c6fdda9]
- Updated dependencies [94c5113]
  - @gamekit/ai-core@0.1.0-alpha.6
  - @gamekit/animator-core@0.1.0-alpha.6
  - @gamekit/audio-core@0.1.0-alpha.6
  - @gamekit/combat@0.1.0-alpha.6
  - @gamekit/devtools@0.1.0-alpha.6
  - @gamekit/gas@0.1.0-alpha.6
  - @gamekit/multiplayer-core@0.1.0-alpha.6
  - @gamekit/navigation-core@0.1.0-alpha.6
  - @gamekit/asset@0.1.0-alpha.6
  - @gamekit/driver-core@0.1.0-alpha.6
  - @gamekit/physics-core@0.1.0-alpha.6
  - @gamekit/core@0.1.0-alpha.6
  - @gamekit/platform-core@0.1.0-alpha.6
  - @gamekit/renderer-core@0.1.0-alpha.6
  - @gamekit/game-runtime@0.1.0-alpha.6
  - @gamekit/data@0.1.0-alpha.6
  - @gamekit/tca@0.1.0-alpha.6
  - @gamekit/input-core@0.1.0-alpha.6
  - @gamekit/camera-core@0.1.0-alpha.6
  - @gamekit/ui-core@0.1.0-alpha.6
  - @gamekit/save@0.1.0-alpha.6

## 0.1.0-alpha.5

### Minor Changes

- 116b3bd: Add App Host standard Physics module composition, expose the core-owned canonical Multiplayer GameModule factory, and preserve project-reference-compatible declarations for the multi-entry Colyseus adapter.

### Patch Changes

- 42c830b: Add provider-neutral temporal snapshot playback, standard multiplayer presentation module binding, reusable presentation projectors, declared Network presentation tracks, typed interpolation primitives and small Network value shapes outside backend adapters.
- Updated dependencies [d2d3825]
- Updated dependencies [7d88257]
- Updated dependencies [63c2214]
- Updated dependencies [cf78f3f]
- Updated dependencies [42c830b]
- Updated dependencies [c2b4371]
- Updated dependencies [116b3bd]
  - @gamekit/multiplayer-core@0.1.0-alpha.4
  - @gamekit/core@0.1.0-alpha.5
  - @gamekit/platform-core@0.1.0-alpha.5
  - @gamekit/renderer-core@0.1.0-alpha.5
  - @gamekit/game-runtime@0.1.0-alpha.5
  - @gamekit/data@0.1.0-alpha.5
  - @gamekit/tca@0.1.0-alpha.5
  - @gamekit/gas@0.1.0-alpha.5
  - @gamekit/input-core@0.1.0-alpha.5
  - @gamekit/camera-core@0.1.0-alpha.5
  - @gamekit/physics-core@0.1.0-alpha.5
  - @gamekit/driver-core@0.1.0-alpha.5
  - @gamekit/devtools@0.1.0-alpha.5
  - @gamekit/ui-core@0.1.0-alpha.5
  - @gamekit/asset@0.1.0-alpha.5
  - @gamekit/save@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- @gamekit/core@0.1.0-alpha.4
- @gamekit/platform-core@0.1.0-alpha.4
- @gamekit/renderer-core@0.1.0-alpha.4
- @gamekit/game-runtime@0.1.0-alpha.4
- @gamekit/data@0.1.0-alpha.4
- @gamekit/tca@0.1.0-alpha.4
- @gamekit/gas@0.1.0-alpha.4
- @gamekit/input-core@0.1.0-alpha.4
- @gamekit/camera-core@0.1.0-alpha.4
- @gamekit/driver-core@0.1.0-alpha.4
- @gamekit/devtools@0.1.0-alpha.4
- @gamekit/ui-core@0.1.0-alpha.4
- @gamekit/asset@0.1.0-alpha.4
- @gamekit/save@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [544f137]
  - @gamekit/driver-core@0.1.0-alpha.3
  - @gamekit/core@0.1.0-alpha.3
  - @gamekit/platform-core@0.1.0-alpha.3
  - @gamekit/renderer-core@0.1.0-alpha.3
  - @gamekit/game-runtime@0.1.0-alpha.3
  - @gamekit/data@0.1.0-alpha.3
  - @gamekit/tca@0.1.0-alpha.3
  - @gamekit/gas@0.1.0-alpha.3
  - @gamekit/input-core@0.1.0-alpha.3
  - @gamekit/camera-core@0.1.0-alpha.3
  - @gamekit/devtools@0.1.0-alpha.3
  - @gamekit/ui-core@0.1.0-alpha.3
  - @gamekit/asset@0.1.0-alpha.3
  - @gamekit/save@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- 3469457: [codex] Make renderer native control explicit
- Updated dependencies [3469457]
  - @gamekit/driver-core@0.1.0-alpha.2
  - @gamekit/renderer-core@0.1.0-alpha.2
  - @gamekit/core@0.1.0-alpha.2
  - @gamekit/platform-core@0.1.0-alpha.2
  - @gamekit/game-runtime@0.1.0-alpha.2
  - @gamekit/data@0.1.0-alpha.2
  - @gamekit/tca@0.1.0-alpha.2
  - @gamekit/gas@0.1.0-alpha.2
  - @gamekit/input-core@0.1.0-alpha.2
  - @gamekit/camera-core@0.1.0-alpha.2
  - @gamekit/devtools@0.1.0-alpha.2
  - @gamekit/ui-core@0.1.0-alpha.2
  - @gamekit/asset@0.1.0-alpha.2
  - @gamekit/save@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- 5a5f227: Merge pull request #1 from ziyu/codex/alpha-package-release
- Updated dependencies [5a5f227]
  - @gamekit/asset@0.1.0-alpha.1
  - @gamekit/camera-core@0.1.0-alpha.1
  - @gamekit/core@0.1.0-alpha.1
  - @gamekit/data@0.1.0-alpha.1
  - @gamekit/devtools@0.1.0-alpha.1
  - @gamekit/driver-core@0.1.0-alpha.1
  - @gamekit/game-runtime@0.1.0-alpha.1
  - @gamekit/gas@0.1.0-alpha.1
  - @gamekit/input-core@0.1.0-alpha.1
  - @gamekit/platform-core@0.1.0-alpha.1
  - @gamekit/renderer-core@0.1.0-alpha.1
  - @gamekit/save@0.1.0-alpha.1
  - @gamekit/tca@0.1.0-alpha.1
  - @gamekit/ui-core@0.1.0-alpha.1
