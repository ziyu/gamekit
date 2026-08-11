import {
  createMemoryPhysicsBackend,
  createPhysicsPredictionIsland,
  type PhysicsPredictionIslandAuxiliaryContributor,
  type PhysicsPredictionIslandMemberDefinition
} from "../src";
import { describe, expect, it } from "vitest";

const ACTOR: PhysicsPredictionIslandMemberDefinition = {
  id: "actor",
  body: {
    id: "actor.body",
    kind: "dynamic",
    position: { x: 0, y: 0 },
    linearVelocity: { x: 0, y: 0 },
    gravityScale: 0
  }
};

describe("Physics prediction island auxiliary contributors", () => {
  it("captures and restores auxiliary state during late-command replay", () => {
    const counter = createCounterContributor();
    const island = createIsland(counter);
    island.queue(auxiliaryCommand(1, 1, 1));
    island.queue(auxiliaryCommand(3, 3, 3));
    island.advanceTo(4);
    expect(counter.value()).toBe(4);

    const replayed = island.queue(auxiliaryCommand(2, 2, 2));
    expect(replayed).toMatchObject({ status: "replayed", replayedTicks: 3 });
    expect(counter.value()).toBe(6);
    expect(island.state().auxiliary).toEqual([
      { id: "test.counter", version: "1", state: { value: 6 } }
    ]);
    expect(island.diagnostics()).toMatchObject({
      auxiliaryContributors: 1,
      auxiliaryCommandsApplied: 4,
      auxiliaryCommandsRejected: 0,
      auxiliaryFailures: 0,
      resimulations: 1,
      resimulatedTicks: 3
    });

    island.dispose();
    expect(counter.diagnostics()).toMatchObject({ disposed: true, value: 0 });
    expect(island.diagnostics()).toMatchObject({
      disposed: true,
      auxiliaryContributors: 0,
      historyEntries: 0
    });
  });

  it("reconciles authority auxiliary state atomically and rejects a missing envelope", () => {
    const ownerCounter = createCounterContributor();
    const owner = createIsland(ownerCounter);
    owner.queue(auxiliaryCommand(1, 1, 1));
    owner.advanceTo(3);

    const authorityCounter = createCounterContributor();
    const authority = createIsland(authorityCounter);
    authority.queue(auxiliaryCommand(1, 1, 5));
    authority.advanceTo(3);
    const authorityState = authority.state();

    expect(owner.reconcile(authorityState)).toMatchObject({
      status: "corrected",
      correctionMagnitude: 0,
      replayedTicks: 0
    });
    expect(ownerCounter.value()).toBe(5);
    const beforeMissing = owner.state();
    expect(owner.reconcile({ ...authorityState, auxiliary: undefined }).status).toBe(
      "auxiliary-mismatch"
    );
    expect(owner.state()).toEqual(beforeMissing);
    expect(owner.diagnostics()).toMatchObject({
      auxiliaryReconciliations: 1,
      auxiliaryFailures: 1,
      corrections: 1
    });
    owner.dispose();
    authority.dispose();
  });

  it("resets auxiliary state with generation and enforces contributor byte budgets", () => {
    const counter = createCounterContributor();
    const island = createIsland(counter);
    island.queue(auxiliaryCommand(1, 1, 4));
    island.advanceTo(1);
    expect(counter.value()).toBe(4);
    island.reset("round-2", 0);
    expect(counter.value()).toBe(0);
    expect(island.state()).toMatchObject({ generation: "round-2", tick: 0 });
    expect(island.diagnostics()).toMatchObject({ auxiliaryResets: 1, commands: 0 });
    island.dispose();

    const oversized = createCounterContributor({ maxCheckpointBytes: 1 });
    expect(() => createIsland(oversized)).toThrowError(/Failed to capture auxiliary contributor/);
    expect(oversized.diagnostics().disposed).toBe(true);
  });
});

function createIsland(contributor: PhysicsPredictionIslandAuxiliaryContributor) {
  return createPhysicsPredictionIsland({
    backend: createMemoryPhysicsBackend(),
    generation: "round-1",
    initialMembers: [ACTOR],
    auxiliaryContributors: [contributor],
    maxHistoryTicks: 16,
    maxHistoryBytes: 1024 * 1024,
    maxCheckpointBytes: 1024 * 1024
  });
}

function auxiliaryCommand(tick: number, sequence: number, delta: number) {
  return {
    type: "auxiliary" as const,
    tick,
    sequence,
    contributorId: "test.counter",
    payload: { delta }
  };
}

function createCounterContributor(options: { maxCheckpointBytes?: number } = {}) {
  let value = 0;
  let disposed = false;
  return {
    id: "test.counter",
    version: "1",
    order: 10,
    maxCheckpointBytes: options.maxCheckpointBytes ?? 128,
    apply(command: { delta: number }) {
      value += command.delta;
    },
    capture() {
      return { value };
    },
    validate(checkpoint: { value: number }) {
      return Number.isFinite(checkpoint.value);
    },
    restore(checkpoint: { value: number }) {
      value = checkpoint.value;
    },
    reconcile(checkpoint: { value: number }) {
      value = checkpoint.value;
    },
    reset() {
      value = 0;
    },
    measureBytes(checkpoint: { value: number }) {
      return new TextEncoder().encode(JSON.stringify(checkpoint)).byteLength;
    },
    hash(checkpoint: { value: number }) {
      return String(checkpoint.value);
    },
    dispose() {
      disposed = true;
      value = 0;
    },
    value() {
      return value;
    },
    diagnostics() {
      return { value, disposed };
    }
  } satisfies PhysicsPredictionIslandAuxiliaryContributor<{ delta: number }, { value: number }> & {
    value(): number;
    diagnostics(): { value: number; disposed: boolean };
  };
}
