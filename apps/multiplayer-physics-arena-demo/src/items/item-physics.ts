import type {
  PhysicsMaterialDefinition,
  PhysicsPredictionIslandCommand,
  PhysicsPredictionIslandMemberDefinition,
  PhysicsVector
} from "@gamekit/physics-core";

import type { ArenaItemAuthorityInstance } from "./item-authority-runtime";
import type { ArenaCompiledItemDefinition } from "./item-definition";

export function arenaItemPhysicsMemberId(item: ArenaItemAuthorityInstance): string {
  return `${item.id}.body.g${item.instanceGeneration}`;
}

export function createArenaItemPhysicsMaterial(
  definition: ArenaCompiledItemDefinition
): PhysicsMaterialDefinition {
  return {
    id: `arena.item-material.${definition.id}`,
    friction: definition.friction,
    restitution: definition.restitution,
    density: definition.mass
  };
}

export function createArenaItemPhysicsMember(input: {
  definition: ArenaCompiledItemDefinition;
  item: ArenaItemAuthorityInstance;
  position: PhysicsVector;
  linearVelocity?: PhysicsVector | undefined;
}): PhysicsPredictionIslandMemberDefinition {
  const memberId = arenaItemPhysicsMemberId(input.item);
  return {
    id: memberId,
    body: {
      id: memberId,
      kind: "dynamic",
      position: cloneVector(input.position),
      ...(input.linearVelocity === undefined
        ? {}
        : { linearVelocity: clampVelocity(input.linearVelocity, input.definition.maxLinearSpeed) }),
      continuousCollisionDetection: input.definition.continuousCollisionDetection,
      damping: { linear: 0.35, angular: 0.25 },
      userData: {
        itemId: input.item.id,
        itemGeneration: input.item.instanceGeneration,
        definitionId: input.definition.id
      }
    },
    colliders: [
      {
        id: `${memberId}.collider`,
        shape: structuredClone(input.definition.shape),
        material: `arena.item-material.${input.definition.id}`,
        filter: { groups: ["arena-item"], collidesWith: ["arena-actor", "arena-world"] }
      }
    ]
  };
}

export function planArenaItemPickup(input: {
  item: ArenaItemAuthorityInstance;
  tick: number;
  sequence: number;
}): PhysicsPredictionIslandCommand {
  return {
    type: "despawn",
    tick: input.tick,
    sequence: input.sequence,
    memberId: arenaItemPhysicsMemberId(input.item)
  };
}

export function planArenaItemRelease(input: {
  definition: ArenaCompiledItemDefinition;
  item: ArenaItemAuthorityInstance;
  position: PhysicsVector;
  aim: PhysicsVector;
  inheritedVelocity: PhysicsVector;
  charge: number;
  tick: number;
  sequence: number;
  mode: "drop" | "throw";
}): PhysicsPredictionIslandCommand {
  const aim = normalize(input.aim);
  const charge = Math.max(0, Math.min(1, input.charge));
  const launchSpeed =
    input.mode === "drop"
      ? Math.min(2, input.definition.launchSpeed)
      : input.definition.launchSpeed * (0.55 + charge * 0.45);
  const linearVelocity = add(input.inheritedVelocity, scale(aim, launchSpeed));
  return {
    type: "spawn",
    tick: input.tick,
    sequence: input.sequence,
    member: createArenaItemPhysicsMember({
      definition: input.definition,
      item: input.item,
      position: input.position,
      linearVelocity
    })
  };
}

function normalize(value: PhysicsVector): PhysicsVector {
  const length = Math.hypot(value.x, value.y, value.z ?? 0);
  if (!Number.isFinite(length) || length <= 0.0001) {
    throw new Error("Arena item release requires a finite non-zero aim");
  }
  return { x: value.x / length, y: value.y / length, z: (value.z ?? 0) / length };
}

function clampVelocity(value: PhysicsVector, maxSpeed: number): PhysicsVector {
  const length = Math.hypot(value.x, value.y, value.z ?? 0);
  return length <= maxSpeed ? cloneVector(value) : scale(value, maxSpeed / length);
}

function add(left: PhysicsVector, right: PhysicsVector): PhysicsVector {
  return { x: left.x + right.x, y: left.y + right.y, z: (left.z ?? 0) + (right.z ?? 0) };
}

function scale(value: PhysicsVector, amount: number): PhysicsVector {
  return { x: value.x * amount, y: value.y * amount, z: (value.z ?? 0) * amount };
}

function cloneVector(value: PhysicsVector): PhysicsVector {
  return { x: value.x, y: value.y, ...(value.z === undefined ? {} : { z: value.z }) };
}
