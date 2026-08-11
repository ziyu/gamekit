import { describe, expect, it } from "vitest";

import { ARENA_COMPILED_CONTENT } from "../content/default-content";
import {
  planArenaHazardBodyCommands,
  planArenaStageInstallation,
  sampleArenaStageHazards
} from "../shared/arena-stage-course";

describe("Knockout Arena compiled stage course", () => {
  it("atomically replaces course members and places qualified actors at the next start grid", () => {
    let sequence = 0;
    const circuitMembers = ARENA_COMPILED_CONTENT.stages[0]!.courseProjection.memberDefinitions;
    const scrapMembers = ARENA_COMPILED_CONTENT.stages[1]!.courseProjection.memberDefinitions;
    const plan = planArenaStageInstallation({
      stageIndex: 1,
      tick: 420,
      currentMemberIds: [
        "player.0",
        "player.1",
        "bot.0",
        "bot.1",
        "bot.2",
        "bot.3",
        ...circuitMembers.map(({ id }) => id)
      ],
      entrantActorIds: ["player.1", "bot.2", "player.0", "bot.0", "bot.3", "bot.1"],
      nextSequence: () => sequence++
    });

    expect(
      plan.commands
        .filter((command) => command.type === "despawn")
        .map((command) => command.memberId)
        .sort()
    ).toEqual(circuitMembers.map(({ id }) => id).sort());
    expect(
      plan.commands
        .filter((command) => command.type === "spawn")
        .map((command) => command.member.id)
        .sort()
    ).toEqual(scrapMembers.map(({ id }) => id).sort());
    expect(Object.keys(plan.actorSpawns)).toHaveLength(6);
    expect(Object.values(plan.actorSpawns).every((position) => position.x > 30)).toBe(true);
    expect(new Set(plan.commands.map((command) => command.sequence)).size).toBe(
      plan.commands.length
    );
  });

  it("samples every hazard from absolute stage tick without accumulated drift", () => {
    const first = sampleArenaStageHazards({ stageIndex: 0, tick: 480, stageStartedAtTick: 300 });
    const replay = sampleArenaStageHazards({ stageIndex: 0, tick: 480, stageStartedAtTick: 300 });
    const nextCycle = sampleArenaStageHazards({
      stageIndex: 0,
      tick: 720,
      stageStartedAtTick: 300
    });

    expect(first).toEqual(replay);
    expect(first.map(({ memberId }) => memberId)).toEqual([
      "circuit.sweeper",
      "circuit.moving-bridge",
      "circuit.piston-gate"
    ]);
    expect(first.every(({ nextTransitionTick }) => nextTransitionTick > 480)).toBe(true);
    expect(nextCycle.find(({ memberId }) => memberId === "circuit.sweeper")?.patch).toEqual(
      first.find(({ memberId }) => memberId === "circuit.sweeper")?.patch
    );
  });

  it("keeps all eight Circuit Forge starts and the ordered finish route inside authored bounds", () => {
    const circuit = ARENA_COMPILED_CONTENT.stages[0]!.courseProjection;
    const routeVolumes = circuit.validationProbes
      .flatMap((probe) =>
        probe.volume?.kind === "checkpoint" || probe.volume?.kind === "finish" ? [probe.volume] : []
      )
      .sort((left, right) => (left.routeOrder ?? 0) - (right.routeOrder ?? 0));

    expect(circuit.participantSpawns).toHaveLength(8);
    expect(routeVolumes.map(({ routeOrder }) => routeOrder)).toEqual([1, 2, 3]);
    for (const spawn of circuit.participantSpawns) {
      expect(insideBounds(spawn.position, circuit.bounds)).toBe(true);
      expect(routeVolumes.every((volume) => insideBounds(volume.position, circuit.bounds))).toBe(
        true
      );
      expect(
        circuit.navigation.source.triangles.some((triangle) => triangle.area === "walkable")
      ).toBe(true);
    }
  });

  it("produces deterministic conveyor, wind, launch-pad and shrinking-zone body commands", () => {
    const scrap = planArenaHazardBodyCommands({
      stageIndex: 1,
      tick: 18,
      stageStartedAtTick: 0,
      bodies: [
        dynamicBody("actor.conveyor", { x: 36, y: 1.1, z: 8.4 }),
        dynamicBody("actor.wind", { x: 28.5, y: 1.3, z: -1 }),
        dynamicBody("actor.bounce", { x: 42.5, y: 1.1, z: -4.8 })
      ]
    });
    expect(scrap.map(({ memberId }) => memberId)).toEqual(
      expect.arrayContaining(["actor.conveyor", "actor.wind", "actor.bounce"])
    );
    expect(scrap.find(({ memberId }) => memberId === "actor.bounce")?.command).toMatchObject({
      type: "linear-impulse",
      impulse: { y: expect.any(Number) }
    });

    const crown = planArenaHazardBodyCommands({
      stageIndex: 2,
      tick: 3_600,
      stageStartedAtTick: 0,
      bodies: [dynamicBody("actor.edge", { x: 80, y: 1.2, z: 0 })]
    });
    expect(crown).toEqual([
      expect.objectContaining({
        memberId: "actor.edge",
        command: expect.objectContaining({ type: "linear-impulse" })
      })
    ]);
  });
});

function dynamicBody(id: string, position: { x: number; y: number; z: number }) {
  return {
    id,
    kind: "dynamic" as const,
    position,
    linearVelocity: { x: 0, y: 0, z: 0 },
    sleeping: false
  };
}

function insideBounds(
  point: { x: number; y: number; z?: number },
  bounds: {
    min: { x: number; y: number; z?: number };
    max: { x: number; y: number; z?: number };
  }
): boolean {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    (point.z ?? 0) >= (bounds.min.z ?? 0) &&
    (point.z ?? 0) <= (bounds.max.z ?? 0)
  );
}
