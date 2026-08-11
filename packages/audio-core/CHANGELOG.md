# @gamekit/audio-core

## 0.1.0-alpha.6

### Minor Changes

- c6fdda9: Add a backend-neutral `GameAudio` facade with separate Music, SFX, Dialogue, Mix, and Spatial
  control surfaces. Support music state and transitions, layered and weighted SFX variations,
  backend-authored objects, dialogue queue and interrupt policy, controllable playback handles,
  scheduled playback, lifecycle and marker events, typed global/instance parameters, stable
  listeners and batch emitters, hierarchical buses, volume ramps, stackable mix snapshots, named
  global/owner/emitter concurrency policies, retrigger windows, multiplayer deduplication, browser
  unlock state, bounded diagnostics, and distinct logical-instance/native-playback snapshots.

  Add an isolated backend contract subpath, memory and null backends, and a reusable conformance
  suite that verifies the same playback-control, spatial, mix, lifecycle, ownership, and dispose
  contracts used by production backends.

### Patch Changes

- Updated dependencies [c6fdda9]
  - @gamekit/asset@0.1.0-alpha.6
  - @gamekit/core@0.1.0-alpha.6
