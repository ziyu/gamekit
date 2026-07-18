import type { EntityId } from "@gamekit/world";

import type { OutpostCombatAbility } from "../domain";

export type OutpostAuthorityCombatCommand = {
  id: string;
  playerId: string;
  ability: OutpostCombatAbility;
  aimX: number;
  aimY: number;
  correlationId?: string | undefined;
  parentId?: string | undefined;
};

export type OutpostAuthorityEnemySpawn = {
  id: string;
  definitionId: string;
  x: number;
  y: number;
  activationDelayMs?: number | undefined;
};

export type OutpostAuthorityCombatPlayer = {
  playerId: string;
  entityId: EntityId;
  networkEntityId: string;
  generation: number;
  actorId: string;
  bodyId: string;
  colliderId: string;
};

export type OutpostAuthorityCombatActorSnapshot = {
  id: string;
  kind: "player" | "enemy" | "buildable";
  definitionId: string;
  renderKey: string;
  networkEntityId: string;
  generation: number;
  entityId: EntityId;
  actorId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
  health: number;
  shield: number;
  stamina: number;
  resource: number;
  tags: string[];
  cooldowns: Record<string, number>;
};

export type OutpostAuthorityCombatProjectileSnapshot = {
  id: string;
  renderKey: string;
  networkEntityId: string;
  generation: number;
  entityId: EntityId;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
};

export type OutpostAuthorityCombatSnapshot = {
  actors: OutpostAuthorityCombatActorSnapshot[];
  projectiles: OutpostAuthorityCombatProjectileSnapshot[];
  projectileCount: number;
  acceptedCommands: number;
  rejectedCommands: number;
  projectileHits: number;
  enemyAttacks: number;
  kills: number;
  drops: number;
  objectiveProgress: number;
};
