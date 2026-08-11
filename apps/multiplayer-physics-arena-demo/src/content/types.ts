import type { DataRef } from "@gamekit/data";
import type { PhysicsVector } from "@gamekit/physics-core";

export const ARENA_MATCH_RULE_TYPE = "arena.match-rule";
export const ARENA_STAGE_TYPE = "arena.stage";
export const ARENA_COURSE_TYPE = "arena.course";
export const ARENA_HAZARD_TYPE = "arena.hazard";
export const ARENA_ITEM_TYPE = "arena.item";
export const ARENA_MOTOR_PROFILE_TYPE = "arena.character-motor";
export const ARENA_BOT_ARCHETYPE_TYPE = "arena.bot-archetype";
export const ARENA_SPAWN_SET_TYPE = "arena.spawn-set";

export type ArenaMatchRuleDefinition = {
  id: string;
  participantCount: number;
  stages: Array<DataRef<typeof ARENA_STAGE_TYPE>>;
};

export type ArenaStageKind = "qualifier" | "brawl" | "final";

export type ArenaStageDefinition = {
  id: string;
  kind: ArenaStageKind;
  course: DataRef<typeof ARENA_COURSE_TYPE>;
  qualificationCount: number;
  durationTicks: number;
  itemPool: Array<DataRef<typeof ARENA_ITEM_TYPE>>;
  botArchetypes: Array<DataRef<typeof ARENA_BOT_ARCHETYPE_TYPE>>;
};

export type ArenaCourseDefinition = {
  id: string;
  definitionVersion: string;
  spawnSet: DataRef<typeof ARENA_SPAWN_SET_TYPE>;
  hazards: Array<DataRef<typeof ARENA_HAZARD_TYPE>>;
};

export type ArenaHazardKind =
  | "rotating-sweeper"
  | "moving-platform"
  | "piston"
  | "conveyor"
  | "wind-zone"
  | "bounce-pad"
  | "crumble-floor"
  | "shrinking-zone";

export type ArenaHazardDefinition = {
  id: string;
  kind: ArenaHazardKind;
  bodyKind: "kinematic" | "sensor";
  schedule: {
    periodTicks: number;
    phaseTicks: number;
    activeTicks: number;
  };
};

export type ArenaItemKind = "throwable" | "impact" | "area" | "melee";

export type ArenaItemShapeDefinition =
  | { type: "sphere"; radius: number }
  | { type: "box"; width: number; height: number; depth: number };

export type ArenaItemDefinition = {
  id: string;
  kind: ArenaItemKind;
  physics: {
    shape: ArenaItemShapeDefinition;
    mass: number;
    friction: number;
    restitution: number;
    continuousCollisionDetection: boolean;
    maxLinearSpeed: number;
    lifetimeTicks: number;
    maxBounces: number;
  };
  carry: {
    socket: string;
    speedMultiplier: number;
    jumpMultiplier: number;
    dropPolicy: "drop" | "spend";
  };
  action: {
    mode: "throw-contact" | "throw-area" | "melee";
    windupTicks: number;
    maxChargeTicks: number;
    activeTicks: number;
    cooldownTicks: number;
    launchSpeed: number;
    baseImpulse: number;
    areaRadius: number;
  };
  respawn: {
    mode: "timed" | "none";
    ticks: number;
  };
  presentationId: string;
  networkStrategy: "predicted-entity" | "authority-only";
};

export type ArenaMotorProfileDefinition = {
  id: string;
  maxGroundSpeed: number;
  groundAcceleration: number;
  groundBraking: number;
  airAcceleration: number;
  jumpSpeed: number;
  diveSpeed: number;
  coyoteTicks: number;
  jumpBufferTicks: number;
};

export type ArenaBotArchetypeDefinition = {
  id: string;
  motor: DataRef<typeof ARENA_MOTOR_PROFILE_TYPE>;
  reactionTicks: number;
  aimErrorRadians: number;
  aggression: number;
  riskTolerance: number;
  preferredItems: Array<DataRef<typeof ARENA_ITEM_TYPE>>;
};

export type ArenaSpawnKind = "participant" | "item" | "hazard";

export type ArenaSpawnPointDefinition = {
  id: string;
  kind: ArenaSpawnKind;
  position: PhysicsVector;
  definition?: DataRef | undefined;
};

export type ArenaSpawnSetDefinition = {
  id: string;
  points: ArenaSpawnPointDefinition[];
};

export type ArenaContentDefinition =
  | ArenaMatchRuleDefinition
  | ArenaStageDefinition
  | ArenaCourseDefinition
  | ArenaHazardDefinition
  | ArenaItemDefinition
  | ArenaMotorProfileDefinition
  | ArenaBotArchetypeDefinition
  | ArenaSpawnSetDefinition;
