import type { DataPack, DataRef } from "@gamekit/data";
import {
  ARENA_BOT_ARCHETYPE_TYPE,
  ARENA_COURSE_TYPE,
  ARENA_HAZARD_TYPE,
  ARENA_ITEM_TYPE,
  ARENA_MATCH_RULE_TYPE,
  ARENA_MOTOR_PROFILE_TYPE,
  ARENA_SPAWN_SET_TYPE,
  ARENA_STAGE_TYPE,
  type ArenaBotArchetypeDefinition,
  type ArenaCourseDefinition,
  type ArenaHazardDefinition,
  type ArenaItemDefinition,
  type ArenaMatchRuleDefinition,
  type ArenaMotorProfileDefinition,
  type ArenaSpawnPointDefinition,
  type ArenaSpawnSetDefinition,
  type ArenaStageDefinition
} from "./types";

export const ARENA_CONTENT_PACK_ID = "knockout-arena.base";
export const ARENA_CONTENT_VERSION = "1.0.0";
export const ARENA_DEFAULT_MATCH_RULE_ID = "match.knockout.standard";

const items: ArenaItemDefinition[] = [
  item("item.foam-ball", "throwable", 0.75, 1, 8, 24, 240),
  item("item.energy-block", "impact", 4.5, 0.72, 24, 45, 300),
  item("item.blast-orb", "area", 1.6, 0.88, 18, 60, 360),
  item("item.foam-hammer", "melee", 2.2, 0.82, 14, 36, 300)
];

const motorProfiles: ArenaMotorProfileDefinition[] = [
  {
    id: "motor.standard",
    maxGroundSpeed: 6.4,
    groundAcceleration: 28,
    groundBraking: 34,
    airAcceleration: 9,
    jumpSpeed: 7.2,
    diveSpeed: 9.4,
    coyoteTicks: 6,
    jumpBufferTicks: 7
  }
];

const botArchetypes: ArenaBotArchetypeDefinition[] = [
  bot("bot.sprinter", 7, 0.12, 0.35, 0.68, ["item.foam-ball"]),
  bot("bot.brawler", 10, 0.08, 0.88, 0.72, ["item.foam-hammer", "item.energy-block"]),
  bot("bot.opportunist", 13, 0.18, 0.62, 0.42, ["item.blast-orb", "item.foam-ball"])
];

const hazards: ArenaHazardDefinition[] = [
  hazard("hazard.circuit.sweeper", "rotating-sweeper", "kinematic", 240, 0, 240),
  hazard("hazard.circuit.platform", "moving-platform", "kinematic", 300, 45, 300),
  hazard("hazard.circuit.piston", "piston", "kinematic", 180, 30, 72),
  hazard("hazard.scrap.conveyor", "conveyor", "kinematic", 300, 0, 300),
  hazard("hazard.scrap.wind", "wind-zone", "sensor", 210, 35, 90),
  hazard("hazard.scrap.bounce", "bounce-pad", "sensor", 120, 0, 120),
  hazard("hazard.crown.floor", "crumble-floor", "kinematic", 360, 60, 240),
  hazard("hazard.crown.zone", "shrinking-zone", "sensor", 900, 0, 900)
];

const spawnSets: ArenaSpawnSetDefinition[] = [
  spawnSet("spawn.circuit", participantPoints(8, 5.4)),
  spawnSet("spawn.scrap", [
    ...participantPoints(6, 4.2),
    ...itemPoints(["item.foam-ball", "item.energy-block", "item.blast-orb", "item.foam-hammer"])
  ]),
  spawnSet("spawn.crown", [
    ...participantPoints(3, 3.4),
    ...itemPoints(["item.foam-ball", "item.foam-hammer"])
  ])
];

const courses: ArenaCourseDefinition[] = [
  course("course.circuit-forge", "spawn.circuit", [
    "hazard.circuit.sweeper",
    "hazard.circuit.platform",
    "hazard.circuit.piston"
  ]),
  course("course.scrap-yard", "spawn.scrap", [
    "hazard.scrap.conveyor",
    "hazard.scrap.wind",
    "hazard.scrap.bounce"
  ]),
  course("course.crown-collapse", "spawn.crown", ["hazard.crown.floor", "hazard.crown.zone"])
];

const stages: ArenaStageDefinition[] = [
  stage("stage.circuit-forge", "qualifier", "course.circuit-forge", 6, 5_400, ["item.foam-ball"]),
  stage(
    "stage.scrap-yard",
    "brawl",
    "course.scrap-yard",
    3,
    5_400,
    items.map(({ id }) => id)
  ),
  stage("stage.crown-collapse", "final", "course.crown-collapse", 1, 4_500, [
    "item.foam-ball",
    "item.foam-hammer"
  ])
];

const matchRules: ArenaMatchRuleDefinition[] = [
  {
    id: ARENA_DEFAULT_MATCH_RULE_ID,
    participantCount: 8,
    stages: stages.map(({ id }) => ref(ARENA_STAGE_TYPE, id))
  }
];

export const arenaContentPack: DataPack = {
  id: ARENA_CONTENT_PACK_ID,
  version: ARENA_CONTENT_VERSION,
  namespace: "knockout-arena",
  entries: [
    ...motorProfiles.map((data) => entry(ARENA_MOTOR_PROFILE_TYPE, data)),
    ...items.map((data) => entry(ARENA_ITEM_TYPE, data)),
    ...botArchetypes.map((data) => entry(ARENA_BOT_ARCHETYPE_TYPE, data)),
    ...hazards.map((data) => entry(ARENA_HAZARD_TYPE, data)),
    ...spawnSets.map((data) => entry(ARENA_SPAWN_SET_TYPE, data)),
    ...courses.map((data) => entry(ARENA_COURSE_TYPE, data)),
    ...stages.map((data) => entry(ARENA_STAGE_TYPE, data)),
    ...matchRules.map((data) => entry(ARENA_MATCH_RULE_TYPE, data))
  ]
};

function item(
  id: string,
  kind: ArenaItemDefinition["kind"],
  mass: number,
  carrySpeedMultiplier: number,
  windupTicks: number,
  cooldownTicks: number,
  respawnTicks: number
): ArenaItemDefinition {
  return { id, kind, mass, carrySpeedMultiplier, windupTicks, cooldownTicks, respawnTicks };
}

function bot(
  id: string,
  reactionTicks: number,
  aimErrorRadians: number,
  aggression: number,
  riskTolerance: number,
  preferredItems: string[]
): ArenaBotArchetypeDefinition {
  return {
    id,
    motor: ref(ARENA_MOTOR_PROFILE_TYPE, "motor.standard"),
    reactionTicks,
    aimErrorRadians,
    aggression,
    riskTolerance,
    preferredItems: preferredItems.map((itemId) => ref(ARENA_ITEM_TYPE, itemId))
  };
}

function hazard(
  id: string,
  kind: ArenaHazardDefinition["kind"],
  bodyKind: ArenaHazardDefinition["bodyKind"],
  periodTicks: number,
  phaseTicks: number,
  activeTicks: number
): ArenaHazardDefinition {
  return { id, kind, bodyKind, schedule: { periodTicks, phaseTicks, activeTicks } };
}

function spawnSet(id: string, points: ArenaSpawnPointDefinition[]): ArenaSpawnSetDefinition {
  return { id, points };
}

function participantPoints(count: number, z: number): ArenaSpawnPointDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `participant.${index}`,
    kind: "participant" as const,
    position: { x: (index - (count - 1) / 2) * 1.7, y: 1.3, z }
  }));
}

function itemPoints(ids: string[]): ArenaSpawnPointDefinition[] {
  return ids.map((id, index) => ({
    id: `item.${index}`,
    kind: "item",
    position: { x: (index - (ids.length - 1) / 2) * 2.4, y: 1.2, z: -1.5 },
    definition: ref(ARENA_ITEM_TYPE, id)
  }));
}

function course(id: string, spawnSetId: string, hazardIds: string[]): ArenaCourseDefinition {
  return {
    id,
    definitionVersion: `${id}.v1`,
    spawnSet: ref(ARENA_SPAWN_SET_TYPE, spawnSetId),
    hazards: hazardIds.map((hazardId) => ref(ARENA_HAZARD_TYPE, hazardId))
  };
}

function stage(
  id: string,
  kind: ArenaStageDefinition["kind"],
  courseId: string,
  qualificationCount: number,
  durationTicks: number,
  itemIds: string[]
): ArenaStageDefinition {
  return {
    id,
    kind,
    course: ref(ARENA_COURSE_TYPE, courseId),
    qualificationCount,
    durationTicks,
    itemPool: itemIds.map((itemId) => ref(ARENA_ITEM_TYPE, itemId)),
    botArchetypes: botArchetypes.map(({ id: botId }) => ref(ARENA_BOT_ARCHETYPE_TYPE, botId))
  };
}

function entry<T extends { id: string }>(type: string, data: T) {
  return { type, id: data.id, data };
}

function ref<TType extends string>(type: TType, id: string): DataRef<TType> {
  return { type, id };
}
