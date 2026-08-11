import type {
  PhysicsBodyState,
  PhysicsPredictionIslandEnvironment,
  PhysicsPredictionIslandMemberDefinition,
  PhysicsVector
} from "@gamekit/physics-core";

import {
  ARENA_ACTOR_COUNT,
  ARENA_BOT_COUNT,
  ARENA_MAX_HUMANS,
  arenaBotMemberId,
  arenaPlayerMemberId
} from "./config";

export type ArenaMemberRole = "player" | "bot" | "prop" | "sweeper" | "platform";

const ACTOR_SPAWNS: readonly PhysicsVector[] = [
  { x: -4.8, y: 1.3, z: 5.4 },
  { x: 4.8, y: 1.3, z: 5.4 },
  { x: -7.2, y: 1.3, z: 3.1 },
  { x: -2.4, y: 1.3, z: 3.1 },
  { x: 2.4, y: 1.3, z: 3.1 },
  { x: 7.2, y: 1.3, z: 3.1 },
  { x: -4, y: 1.3, z: 0.8 },
  { x: 4, y: 1.3, z: 0.8 }
];

export const ARENA_ENVIRONMENT: PhysicsPredictionIslandEnvironment = {
  bodies: [
    { id: "course.floor", kind: "static", position: { x: 0, y: -0.5, z: 0 } },
    { id: "course.ramp-left", kind: "static", position: { x: -7.8, y: 0.5, z: -6 } },
    { id: "course.ramp-right", kind: "static", position: { x: 7.8, y: 0.5, z: -6 } },
    { id: "course.finish", kind: "static", position: { x: 0, y: 1.2, z: -11.5 } }
  ],
  colliders: [
    {
      id: "course.floor.collider",
      bodyId: "course.floor",
      shape: { type: "box", width: 21, height: 1, depth: 25 },
      material: "course"
    },
    {
      id: "course.ramp-left.collider",
      bodyId: "course.ramp-left",
      shape: { type: "box", width: 4.5, height: 1, depth: 5 },
      material: "course"
    },
    {
      id: "course.ramp-right.collider",
      bodyId: "course.ramp-right",
      shape: { type: "box", width: 4.5, height: 1, depth: 5 },
      material: "course"
    },
    {
      id: "course.finish.collider",
      bodyId: "course.finish",
      shape: { type: "box", width: 8, height: 1, depth: 2.2 },
      material: "course"
    }
  ]
};

export function createArenaMemberDefinitions(): PhysicsPredictionIslandMemberDefinition[] {
  const members: PhysicsPredictionIslandMemberDefinition[] = [];
  for (let slot = 0; slot < ARENA_MAX_HUMANS; slot += 1) {
    members.push(createActorDefinition(arenaPlayerMemberId(slot), ACTOR_SPAWNS[slot]!));
  }
  for (let slot = 0; slot < ARENA_BOT_COUNT; slot += 1) {
    members.push(
      createActorDefinition(arenaBotMemberId(slot), ACTOR_SPAWNS[slot + ARENA_MAX_HUMANS]!)
    );
  }
  members.push(
    createDynamicBox("prop.cube.0", { x: -3.2, y: 1.1, z: -2.5 }),
    createDynamicBox("prop.cube.1", { x: 3.2, y: 1.1, z: -2.5 }),
    createDynamicSphere("prop.ball.0", { x: 0, y: 1.2, z: -4.8 }),
    createKinematicBox("hazard.sweeper", { x: 0, y: 1, z: -1.5 }, 13, 0.55, 0.55),
    createKinematicBox("platform.left", { x: -5.8, y: 1, z: -8.7 }, 4, 0.55, 3.2),
    createKinematicBox("platform.right", { x: 5.8, y: 1, z: -8.7 }, 4, 0.55, 3.2)
  );
  return members;
}

export function createArenaDefinitionMap(): ReadonlyMap<
  string,
  PhysicsPredictionIslandMemberDefinition
> {
  return new Map(createArenaMemberDefinitions().map((member) => [member.id, member]));
}

export function arenaMemberRole(id: string): ArenaMemberRole {
  if (id.startsWith("player.")) return "player";
  if (id.startsWith("bot.")) return "bot";
  if (id.startsWith("hazard.")) return "sweeper";
  if (id.startsWith("platform.")) return "platform";
  return "prop";
}

export function arenaActorSpawn(id: string): PhysicsVector {
  if (id.startsWith("player.")) {
    return structuredClone(ACTOR_SPAWNS[Number(id.slice("player.".length))] ?? ACTOR_SPAWNS[0]!);
  }
  if (id.startsWith("bot.")) {
    const slot = Number(id.slice("bot.".length)) + ARENA_MAX_HUMANS;
    return structuredClone(ACTOR_SPAWNS[slot] ?? ACTOR_SPAWNS[ARENA_ACTOR_COUNT - 1]!);
  }
  return { x: 0, y: 2, z: 5 };
}

export function isArenaActor(id: string): boolean {
  return id.startsWith("player.") || id.startsWith("bot.");
}

export function cloneArenaBodyState(body: PhysicsBodyState): PhysicsBodyState {
  return structuredClone(body);
}

function createActorDefinition(
  id: string,
  position: PhysicsVector
): PhysicsPredictionIslandMemberDefinition {
  return {
    id,
    body: {
      id,
      kind: "dynamic",
      position,
      damping: { linear: 3.5, angular: 8 },
      lockedAxes: ["rotation-x", "rotation-z"],
      continuousCollisionDetection: true
    },
    colliders: [
      {
        id: `${id}.collider`,
        shape: { type: "capsule", radius: 0.52, height: 0.85 },
        material: "actor"
      }
    ]
  };
}

function createDynamicBox(
  id: string,
  position: PhysicsVector
): PhysicsPredictionIslandMemberDefinition {
  return {
    id,
    body: { id, kind: "dynamic", position, damping: { linear: 0.8, angular: 0.8 } },
    colliders: [
      {
        id: `${id}.collider`,
        shape: { type: "box", width: 1.5, height: 1.5, depth: 1.5 },
        material: "prop"
      }
    ]
  };
}

function createDynamicSphere(
  id: string,
  position: PhysicsVector
): PhysicsPredictionIslandMemberDefinition {
  return {
    id,
    body: { id, kind: "dynamic", position, damping: { linear: 0.5, angular: 0.4 } },
    colliders: [
      {
        id: `${id}.collider`,
        shape: { type: "sphere", radius: 0.9 },
        material: "prop"
      }
    ]
  };
}

function createKinematicBox(
  id: string,
  position: PhysicsVector,
  width: number,
  height: number,
  depth: number
): PhysicsPredictionIslandMemberDefinition {
  return {
    id,
    body: { id, kind: "kinematic", position },
    colliders: [
      {
        id: `${id}.collider`,
        shape: { type: "box", width, height, depth },
        material: "hazard"
      }
    ]
  };
}
