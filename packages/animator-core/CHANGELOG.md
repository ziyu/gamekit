# @gamekit/animator-core

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [398165e]
  - @gamekit/asset@0.1.0-alpha.7
  - @gamekit/game-runtime@0.1.0-alpha.7
  - @gamekit/core@0.1.0-alpha.7
  - @gamekit/event-bus@0.1.0-alpha.7
  - @gamekit/renderer-core@0.1.0-alpha.7
  - @gamekit/data@0.1.0-alpha.7

## 0.1.0-alpha.6

### Minor Changes

- c6fdda9: Add the backend-neutral Animator controller runtime with data-driven graphs, layers, transitions,
  one-shots, marker deduplication, gameplay phase rebuild, batching, diagnostics, and a memory adapter.
  Compile state, transition, one-shot, and clip indexes at controller bind time and isolate optional trace observers from playback decisions.
  Validate playback clocks and numeric graph fields, scale non-loop clips to authority phase duration, and isolate marker observers from internal marker state.

### Patch Changes

- Updated dependencies [c6fdda9]
  - @gamekit/asset@0.1.0-alpha.6
  - @gamekit/core@0.1.0-alpha.6
  - @gamekit/event-bus@0.1.0-alpha.6
  - @gamekit/renderer-core@0.1.0-alpha.6
  - @gamekit/game-runtime@0.1.0-alpha.6
  - @gamekit/data@0.1.0-alpha.6
