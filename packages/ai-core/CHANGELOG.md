# @gamekit/ai-core

## 0.1.0-alpha.8

### Patch Changes

- Updated dependencies [0326356]
  - @gamekit/save@0.1.0-alpha.8
  - @gamekit/physics-core@0.1.0-alpha.8
  - @gamekit/core@0.1.0-alpha.8
  - @gamekit/event-bus@0.1.0-alpha.8
  - @gamekit/world@0.1.0-alpha.8
  - @gamekit/game-runtime@0.1.0-alpha.8
  - @gamekit/data@0.1.0-alpha.8
  - @gamekit/navigation-core@0.1.0-alpha.8

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [398165e]
- Updated dependencies [ce209d8]
  - @gamekit/game-runtime@0.1.0-alpha.7
  - @gamekit/save@0.1.0-alpha.7
  - @gamekit/physics-core@0.1.0-alpha.7
  - @gamekit/navigation-core@0.1.0-alpha.7
  - @gamekit/core@0.1.0-alpha.7
  - @gamekit/event-bus@0.1.0-alpha.7
  - @gamekit/world@0.1.0-alpha.7
  - @gamekit/data@0.1.0-alpha.7

## 0.1.0-alpha.6

### Minor Changes

- c6fdda9: Add the data-driven AI runtime with bounded perception and decision scheduling, utility goals,
  interruptible task execution, intent output, checkpoints, diagnostics, and GameModule integration.
  Expose isolated trace observers while keeping the future planner adapter contract out of runtime configuration until it has an implemented bounded execution path.
  Compile sensor, goal, task, and scheduler definition indexes once per agent definition and use oldest-due scheduling to prevent low-budget starvation.

### Patch Changes

- Updated dependencies [c6fdda9]
- Updated dependencies [94c5113]
  - @gamekit/navigation-core@0.1.0-alpha.6
  - @gamekit/physics-core@0.1.0-alpha.6
  - @gamekit/core@0.1.0-alpha.6
  - @gamekit/event-bus@0.1.0-alpha.6
  - @gamekit/world@0.1.0-alpha.6
  - @gamekit/game-runtime@0.1.0-alpha.6
  - @gamekit/data@0.1.0-alpha.6
  - @gamekit/save@0.1.0-alpha.6
