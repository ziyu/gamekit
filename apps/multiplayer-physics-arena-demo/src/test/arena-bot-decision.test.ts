import { describe, expect, it } from "vitest";

import {
  createArenaBotDecisionRuntime,
  type ArenaBotBinding,
  type ArenaBotDecisionRuntime
} from "../ai/decision";
import type {
  ArenaBotPerceptionFrame,
  ArenaBotPerceptionSource,
  ArenaBotVisibleActor
} from "../ai/perception";
import { ARENA_COMPILED_CONTENT } from "../content/default-content";

const FIXED_STEP_MS = 1000 / 60;

describe("Knockout Arena bot decisions", () => {
  it("turns deterministic Utility AI movement into the same input contract used by players", () => {
    const left = fixture("bot.sprinter");
    const right = fixture("bot.sprinter");
    const leftInputs = advance(left, 90);
    const rightInputs = advance(right, 90);

    expect(leftInputs).toEqual(rightInputs);
    expect(left.runtime.scoreGoals("bot.0")[0]).toMatchObject({
      goalId: "ai.goal.arena.sprinter.advance"
    });
    expect(left.runtime.agent("bot.0")).toMatchObject({
      goalId: "ai.goal.arena.sprinter.advance",
      task: { taskId: "ai.task.arena.advance", status: "running" }
    });
    expect(leftInputs.filter(({ moveZ }) => moveZ !== 0).at(-1)).toMatchObject({
      moveX: 0,
      moveZ: -1
    });
  });

  it("prioritizes an active nearby hazard and emits a one-tick jump", () => {
    const fixtureValue = fixture("bot.sprinter", {
      hazards: [
        {
          id: "hazard.sweeper",
          kind: "rotating-sweeper",
          phase: "active",
          active: true,
          position: { x: 1, y: 1, z: 0 },
          size: { width: 1, height: 1, depth: 1 },
          nextTransitionTick: 240
        }
      ]
    });

    const inputs = advance(fixtureValue, 90);

    expect(fixtureValue.runtime.agent("bot.0")?.goalId).toBe("ai.goal.arena.sprinter.survive");
    expect(inputs.some(({ jump }) => jump)).toBe(true);
    expect(inputs.at(-1)!.moveX).toBeLessThan(0);
  });

  it("emits pickup and use actions once, then holds the safe point through recovery", () => {
    const pickup = fixture("bot.opportunist", {
      items: [
        {
          instanceId: "item.world.1",
          generation: 1,
          definitionId: "item.blast-orb",
          kind: "throwable",
          position: { x: 0, y: 1, z: 1 },
          value: 1,
          contestedBy: 0
        }
      ]
    });
    advanceUntilAction(pickup);
    expect(pickup.runtime.drainActions()).toEqual([
      expect.objectContaining({
        type: "interaction",
        interactionId: "pickup",
        targetId: "item.world.1"
      })
    ]);
    advance(pickup, 10);
    expect(pickup.runtime.drainActions()).toEqual([]);
    expect(pickup.runtime.agent("bot.0")?.task).toMatchObject({
      taskId: "ai.task.arena.acquire-item",
      safeToInterrupt: false,
      state: { phase: "committed" }
    });

    const attack = fixture("bot.brawler", {
      actors: [actor("participant.self", "bot.0", 0, 0), actor("participant.target", "bot.1", 0, 1)]
    });
    advanceUntilAction(attack);
    expect(attack.runtime.drainActions()).toEqual([
      expect.objectContaining({ type: "action", actionId: "use", targetId: "participant.target" })
    ]);
    expect(attack.runtime.agent("bot.0")?.task).toMatchObject({
      taskId: "ai.task.arena.attack",
      safeToInterrupt: false,
      state: { phase: "committed" }
    });
  });

  it("rejects conflicting bindings and releases every retained AI resource", () => {
    const fixtureValue = fixture("bot.sprinter");

    expect(() =>
      fixtureValue.runtime.bind({
        memberId: "bot.0",
        participantId: "participant.changed",
        archetypeId: "bot.sprinter"
      })
    ).toThrow(/binding conflicts/);
    expect(fixtureValue.runtime.snapshot()).toMatchObject({ agents: 1, disposed: false });

    fixtureValue.runtime.dispose();
    expect(fixtureValue.runtime.snapshot()).toMatchObject({
      agents: 0,
      activeTasks: 0,
      pendingActions: 0,
      disposed: true
    });
    expect(() => fixtureValue.runtime.bind(binding("bot.sprinter"))).toThrow(/disposed/);
  });
});

function fixture(
  archetypeId: string,
  frameOverrides: Partial<ArenaBotPerceptionFrame> = {}
): {
  runtime: ArenaBotDecisionRuntime;
  frame: ArenaBotPerceptionFrame;
  elapsedMs: number;
} {
  const frame: ArenaBotPerceptionFrame = {
    tick: 0,
    elapsedMs: 0,
    stageId: "stage.circuit-forge",
    stageKind: "qualifier",
    actors: [actor("participant.self", "bot.0", 0, 0)],
    items: [],
    hazards: [],
    impacts: [],
    objective: {
      id: "checkpoint.finish",
      position: { x: 0, y: 1, z: -8 },
      routeOrder: 1,
      checkpointCount: 3,
      qualificationCount: 6,
      activeParticipants: 8,
      completedParticipants: 0,
      stageProgress: 0
    },
    ...frameOverrides
  };
  const archetype = ARENA_COMPILED_CONTENT.stages
    .flatMap(({ bots }) => bots)
    .find(({ id }) => id === archetypeId)!;
  const profile = ARENA_COMPILED_CONTENT.botProfiles.find(({ id }) => id === archetype.profile.id)!;
  const source: ArenaBotPerceptionSource = {
    frame: () => frame,
    profileFor: () => profile
  };
  const runtime = createArenaBotDecisionRuntime({
    content: ARENA_COMPILED_CONTENT,
    perception: source
  });
  runtime.bind(binding(archetypeId));
  return { runtime, frame, elapsedMs: 0 };
}

function advance(
  fixtureValue: {
    runtime: ArenaBotDecisionRuntime;
    frame: ArenaBotPerceptionFrame;
    elapsedMs: number;
  },
  ticks: number
) {
  const inputs = [];
  for (let tick = 1; tick <= ticks; tick += 1) {
    fixtureValue.elapsedMs += FIXED_STEP_MS;
    fixtureValue.frame.tick += 1;
    fixtureValue.frame.elapsedMs = fixtureValue.elapsedMs;
    fixtureValue.runtime.update(FIXED_STEP_MS, fixtureValue.elapsedMs);
    inputs.push(fixtureValue.runtime.inputFor("bot.0", fixtureValue.frame.tick));
  }
  return inputs;
}

function advanceUntilAction(fixtureValue: {
  runtime: ArenaBotDecisionRuntime;
  frame: ArenaBotPerceptionFrame;
  elapsedMs: number;
}): void {
  for (let index = 0; index < 180; index += 1) {
    advance(fixtureValue, 1);
    if (fixtureValue.runtime.snapshot().pendingActions > 0) return;
  }
  throw new Error("Arena bot did not emit an action within the acceptance window");
}

function binding(archetypeId: string): ArenaBotBinding {
  return {
    memberId: "bot.0",
    participantId: "participant.self",
    archetypeId
  };
}

function actor(
  participantId: string,
  memberId: string,
  x: number,
  z: number
): ArenaBotVisibleActor {
  return {
    participantId,
    memberId,
    position: { x, y: 1, z },
    linearVelocity: { x: 0, y: 0, z: 0 },
    status: "active",
    instability: 0
  };
}
