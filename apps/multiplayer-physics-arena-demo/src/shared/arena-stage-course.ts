import type {
  PhysicsBodyPatch,
  PhysicsPredictionIslandCommand,
  PhysicsPredictionIslandMemberDefinition,
  PhysicsVector
} from "@gamekit/physics-core";

import { ARENA_COMPILED_CONTENT } from "../content/default-content";
import type { CompiledArenaHazardSchedule } from "../content/course-compiler";

export type ArenaHazardPhase = "idle" | "warning" | "active" | "recovery";

export type ArenaHazardSample = {
  memberId: string;
  phase: ArenaHazardPhase;
  active: boolean;
  nextTransitionTick: number;
  patch: PhysicsBodyPatch;
};

export type ArenaStageInstallationPlan = {
  commands: PhysicsPredictionIslandCommand[];
  memberIds: string[];
  actorSpawns: Readonly<Record<string, PhysicsVector>>;
};

const ALL_COURSE_MEMBER_IDS = new Set(
  ARENA_COMPILED_CONTENT.stages.flatMap((stage) =>
    stage.courseProjection.memberDefinitions.map(({ id }) => id)
  )
);

export function planArenaStageInstallation(options: {
  stageIndex: number;
  tick: number;
  currentMemberIds: readonly string[];
  entrantActorIds: readonly string[];
  nextSequence: () => number;
}): ArenaStageInstallationPlan {
  const stage = requireStage(options.stageIndex);
  const currentIds = new Set(options.currentMemberIds);
  const desiredIds = new Set(
    stage.courseProjection.memberDefinitions.map((definition) => definition.id)
  );
  const commands: PhysicsPredictionIslandCommand[] = [];

  for (const memberId of [...currentIds].sort()) {
    if (!ALL_COURSE_MEMBER_IDS.has(memberId) || desiredIds.has(memberId)) continue;
    commands.push({
      type: "despawn",
      tick: options.tick,
      sequence: options.nextSequence(),
      memberId
    });
  }
  for (const member of stage.courseProjection.memberDefinitions) {
    if (currentIds.has(member.id)) continue;
    commands.push({
      type: "spawn",
      tick: options.tick,
      sequence: options.nextSequence(),
      member: structuredClone(member)
    });
  }

  const actorSpawns: Record<string, PhysicsVector> = {};
  const entrantIds = [...options.entrantActorIds].sort();
  for (const [index, memberId] of entrantIds.entries()) {
    const spawn = stage.courseProjection.participantSpawns[index];
    if (spawn === undefined) {
      throw new Error(
        `arena.stage_spawn_capacity: ${stage.definition.id} cannot place entrant ${memberId}`
      );
    }
    actorSpawns[memberId] = structuredClone(spawn.position);
    commands.push({
      type: "patch",
      tick: options.tick,
      sequence: options.nextSequence(),
      memberId,
      patch: {
        position: structuredClone(spawn.position),
        linearVelocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 }
      }
    });
  }

  return {
    commands,
    memberIds: [...desiredIds].sort(),
    actorSpawns
  };
}

export function sampleArenaStageHazards(options: {
  stageIndex: number;
  tick: number;
  stageStartedAtTick: number;
}): ArenaHazardSample[] {
  const schedules = requireStage(options.stageIndex).courseProjection.hazardSchedules;
  return schedules.map((schedule) =>
    sampleHazard(schedule, Math.max(0, options.tick - options.stageStartedAtTick), options.tick)
  );
}

export function arenaStageCourseMemberDefinitions(
  stageIndex: number
): PhysicsPredictionIslandMemberDefinition[] {
  return structuredClone(requireStage(stageIndex).courseProjection.memberDefinitions);
}

function sampleHazard(
  schedule: CompiledArenaHazardSchedule,
  elapsedTicks: number,
  absoluteTick: number
): ArenaHazardSample {
  const cycleTick = positiveModulo(elapsedTicks + schedule.phaseTicks, schedule.periodTicks);
  const warningTicks = Math.min(30, Math.max(6, Math.floor(schedule.periodTicks * 0.12)));
  const recoveryTicks = Math.min(24, Math.max(6, Math.floor(schedule.periodTicks * 0.08)));
  const active = cycleTick < schedule.activeTicks;
  const phase: ArenaHazardPhase = active
    ? "active"
    : cycleTick >= schedule.periodTicks - warningTicks
      ? "warning"
      : cycleTick < schedule.activeTicks + recoveryTicks
        ? "recovery"
        : "idle";
  const nextBoundary =
    phase === "active"
      ? schedule.activeTicks
      : phase === "recovery"
        ? schedule.activeTicks + recoveryTicks
        : phase === "warning"
          ? schedule.periodTicks
          : schedule.periodTicks - warningTicks;
  const nextTransitionTick = absoluteTick + Math.max(1, nextBoundary - cycleTick);
  const progress = cycleTick / schedule.periodTicks;
  const activeProgress = Math.min(1, cycleTick / Math.max(1, schedule.activeTicks));
  const patch = hazardPatch(schedule, progress, activeProgress, active);
  return { memberId: schedule.memberId, phase, active, nextTransitionTick, patch };
}

function hazardPatch(
  schedule: CompiledArenaHazardSchedule,
  cycleProgress: number,
  activeProgress: number,
  active: boolean
): PhysicsBodyPatch {
  if (schedule.kind === "rotating-sweeper") {
    const angle = cycleProgress * Math.PI * 2;
    return { rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) } };
  }
  if (schedule.kind === "moving-platform") {
    return {
      position: offsetAlongAxis(
        schedule.origin,
        schedule.axis,
        Math.sin(cycleProgress * Math.PI * 2) * schedule.travel
      )
    };
  }
  if (schedule.kind === "piston") {
    const extension = active ? Math.sin(activeProgress * Math.PI) * schedule.travel : 0;
    return { position: offsetAlongAxis(schedule.origin, schedule.axis, extension) };
  }
  if (schedule.kind === "crumble-floor") {
    return {
      position: offsetAlongAxis(schedule.origin, "y", active ? 0 : -Math.max(2, schedule.travel))
    };
  }
  if (schedule.kind === "shrinking-zone") {
    const pulse = active ? Math.max(0.25, 1 - activeProgress * 0.75) : 1;
    return { userData: { hazardStrength: schedule.strength, safeScale: pulse } };
  }
  return {
    position: structuredClone(schedule.origin),
    userData: { hazardStrength: active ? schedule.strength : 0 }
  };
}

function offsetAlongAxis(
  origin: PhysicsVector,
  axis: "x" | "y" | "z",
  distance: number
): PhysicsVector {
  return {
    x: origin.x + (axis === "x" ? distance : 0),
    y: origin.y + (axis === "y" ? distance : 0),
    z: (origin.z ?? 0) + (axis === "z" ? distance : 0)
  };
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function requireStage(stageIndex: number) {
  const stage = ARENA_COMPILED_CONTENT.stages[stageIndex];
  if (stage === undefined) throw new Error(`arena.stage_index: ${stageIndex} is not compiled`);
  return stage;
}
