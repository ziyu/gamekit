export type OutpostReplicatedActor = {
  objectId: string;
  networkEntityId: string;
  generation: number;
  kind: "player" | "enemy" | "buildable";
  definitionId: string;
  renderKey: string;
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

export type OutpostReplicatedProjectile = {
  objectId: string;
  networkEntityId: string;
  generation: number;
  renderKey: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
};

export type OutpostReplicatedCombatState = {
  actors: OutpostReplicatedActor[];
  projectiles: OutpostReplicatedProjectile[];
  acceptedCommands: number;
  rejectedCommands: number;
  projectileHits: number;
  enemyAttacks: number;
  kills: number;
  drops: number;
  objectiveProgress: number;
};
