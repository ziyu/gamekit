import { defineGameModule } from "@gamekit/core";
import type { GasOperationContext } from "@gamekit/gas";
import type { GameInstallContext } from "@gamekit/game-runtime";
import {
  PhysicsTransformComponent,
  PhysicsVelocityComponent,
  type PhysicsBodyData,
  type PhysicsVector
} from "@gamekit/physics-core";
import type { TcaDefinitionSet } from "@gamekit/tca";

import {
  OUTPOST_BUILDABLE_TYPE,
  OUTPOST_ENEMY_TYPE,
  OUTPOST_PLAYER_TYPE,
  OUTPOST_WEAPON_TYPE,
  type OutpostBuildableDefinition,
  type OutpostEnemyDefinition,
  type OutpostPlayerDefinition,
  type OutpostWeaponDefinition
} from "../domain";
import { OutpostGameplayObject } from "./components";
import { createOutpostCombatTcaDefinitions, readPayloadString } from "./authority-combat-tca";
import {
  actorHealth,
  actorKind,
  captureCombatSnapshot,
  combatObjectForQueryResult,
  combatObjects,
  createCombatState,
  firstCollider,
  insideArena,
  materializeActorObject,
  materializeProjectile,
  nearestObject,
  nearestPlayer,
  normalizeVector,
  normalizedAim,
  operationContext,
  OUTPOST_COMBAT_PLAYER_DEFINITION_ID,
  rejectCommand,
  removeCombatObject,
  requireTransform,
  type CombatObject,
  type CombatState,
  type CreateOutpostAuthorityCombatOptions
} from "./authority-combat-state";
import type {
  OutpostAuthorityCombatCommand,
  OutpostAuthorityCombatPlayer,
  OutpostAuthorityCombatSnapshot,
  OutpostAuthorityEnemySpawn
} from "./authority-combat-types";

export type {
  OutpostAuthorityCombatActorSnapshot,
  OutpostAuthorityCombatCommand,
  OutpostAuthorityCombatPlayer,
  OutpostAuthorityCombatProjectileSnapshot,
  OutpostAuthorityCombatSnapshot,
  OutpostAuthorityEnemySpawn
} from "./authority-combat-types";
export type { CreateOutpostAuthorityCombatOptions } from "./authority-combat-state";

const RIFLE_DEFINITION_ID = "weapon.outpost.rifle";
const RAIDER_DEFINITION_ID = "enemy.outpost.raider";
const TURRET_DEFINITION_ID = "buildable.outpost.turret";
const SHOCK_EFFECT_ID = "effect.outpost.shocked";
const DASH_SPEED = 640;
const DASH_DURATION_MS = 180;
const SHOCK_FIELD_RADIUS = 150;
const TURRET_RANGE = 360;
const KNOCKBACK_DURATION_MS = 120;

export type OutpostAuthorityCombat = {
  prePhysicsModule: ReturnType<typeof defineGameModule<GameInstallContext>>;
  postPhysicsModule: ReturnType<typeof defineGameModule<GameInstallContext>>;
  tcaDefinitions: TcaDefinitionSet;
  snapshot(): OutpostAuthorityCombatSnapshot;
};

const DEFAULT_ENEMY_SPAWNS: readonly OutpostAuthorityEnemySpawn[] = Object.freeze([
  {
    id: "enemy.opening.1",
    definitionId: RAIDER_DEFINITION_ID,
    x: 680,
    y: 500,
    activationDelayMs: 4_000
  },
  {
    id: "enemy.opening.2",
    definitionId: RAIDER_DEFINITION_ID,
    x: 1120,
    y: 500,
    activationDelayMs: 4_000
  },
  {
    id: "enemy.opening.3",
    definitionId: RAIDER_DEFINITION_ID,
    x: 900,
    y: 720,
    activationDelayMs: 4_000
  }
]);

export function createOutpostAuthorityCombat(
  options: CreateOutpostAuthorityCombatOptions
): OutpostAuthorityCombat {
  const state = createCombatState(options);

  return {
    prePhysicsModule: createCombatPrePhysicsModule(state),
    postPhysicsModule: createCombatPostPhysicsModule(state),
    tcaDefinitions: createOutpostCombatTcaDefinitions({
      gas: state.options.gas,
      actorKind: (actorId) => actorKind(state, actorId)
    }),
    snapshot() {
      return captureCombatSnapshot(state);
    }
  };
}

function createCombatPrePhysicsModule(state: CombatState) {
  return defineGameModule<GameInstallContext>({
    id: "outpost.authority.combat.pre-physics",
    install(ctx) {
      ctx.systems.register({
        id: "outpost.authority.combat.intent",
        update({ delta }) {
          ensureInitialEnemies(state);
          for (const command of state.options.commands()) {
            executeCombatCommand(state, command);
          }
          updateDashes(state, delta);
          updateEnemySteering(state, delta);
          updateKnockbacks(state, delta);
          updateTurrets(state);
        }
      });

      return () => {
        for (const object of state.objectsById.values()) {
          removeCombatObject(state, object, false);
        }
        state.dashesByPlayerId.clear();
        state.knockbacksByObjectId.clear();
        state.pendingDeaths.clear();
      };
    }
  });
}

function createCombatPostPhysicsModule(state: CombatState) {
  return defineGameModule<GameInstallContext>({
    id: "outpost.authority.combat.post-physics",
    install(ctx) {
      const offKilled = ctx.eventBus.on("outpost.actor_killed", (event) => {
        const actorId = readPayloadString(event, "actorId");
        if (actorId) {
          state.pendingDeaths.set(actorId, {
            actorId,
            ...(event.correlationId === undefined ? {} : { correlationId: event.correlationId }),
            ...(event.parentId === undefined ? {} : { parentId: event.parentId })
          });
        }
      });
      const offDrop = ctx.eventBus.on("outpost.drop.created", () => {
        state.drops += 1;
      });
      const offObjective = ctx.eventBus.on("outpost.objective.progressed", () => {
        state.objectiveProgress += 1;
      });

      ctx.systems.register({
        id: "outpost.authority.combat.resolve",
        update({ delta, tick, elapsed }) {
          resolveProjectiles(state, delta, tick, elapsed);
          flushDeaths(state);
        }
      });

      return () => {
        offObjective();
        offDrop();
        offKilled();
      };
    }
  });
}

function executeCombatCommand(state: CombatState, command: OutpostAuthorityCombatCommand): void {
  const player = state.options.players().get(command.playerId);
  if (
    !player ||
    !state.options.gas.hasActor(player.actorId) ||
    actorHealth(state, player.actorId) <= 0
  ) {
    rejectCommand(state, command, "player-unavailable");
    return;
  }

  switch (command.ability) {
    case "rifle":
      executeRifle(state, player, command);
      return;
    case "dash":
      executeDash(state, player, command);
      return;
    case "shock-field":
      executeShockField(state, player, command);
      return;
    case "deploy-turret":
      executeTurretPlacement(state, player, command);
  }
}

function executeRifle(
  state: CombatState,
  player: OutpostAuthorityCombatPlayer,
  command: OutpostAuthorityCombatCommand
): void {
  const definition = state.options.dataRegistry.getValue<OutpostPlayerDefinition>(
    OUTPOST_PLAYER_TYPE,
    OUTPOST_COMBAT_PLAYER_DEFINITION_ID
  );
  const weapon = state.options.dataRegistry.getValue<OutpostWeaponDefinition>(
    OUTPOST_WEAPON_TYPE,
    definition.weapon.id
  );
  const activation = state.options.gas.activateAbility({
    actorId: player.actorId,
    abilityId: weapon.ability.id,
    ...operationContext(command)
  });
  if (activation.status !== "activated") {
    rejectCommand(state, command, activation.reason);
    return;
  }
  const origin = requireTransform(state.options.world, player.entityId).position;
  const direction = normalizedAim(state.options.world, player.entityId, command.aimX, command.aimY);
  materializeProjectile(state, {
    id: `projectile.${state.nextProjectileId}`,
    bodyDefinitionId: weapon.projectileBody.id,
    renderKey: weapon.projectileRenderObject.id,
    origin,
    direction,
    speed: weapon.projectileSpeed,
    damage: weapon.damage,
    lifetimeMs: weapon.projectileLifetimeMs,
    sourceActorId: player.actorId,
    sourceBodyId: player.bodyId,
    command
  });
  state.nextProjectileId += 1;
  state.acceptedCommands += 1;
}

function executeDash(
  state: CombatState,
  player: OutpostAuthorityCombatPlayer,
  command: OutpostAuthorityCombatCommand
): void {
  const activation = state.options.gas.activateAbility({
    actorId: player.actorId,
    abilityId: "ability.outpost.dash",
    ...operationContext(command)
  });
  if (activation.status !== "activated") {
    rejectCommand(state, command, activation.reason);
    return;
  }
  const direction = normalizedAim(state.options.world, player.entityId, command.aimX, command.aimY);
  state.dashesByPlayerId.set(player.playerId, {
    actorId: player.actorId,
    velocity: { x: direction.x * DASH_SPEED, y: direction.y * DASH_SPEED },
    remainingMs: DASH_DURATION_MS,
    source: command.id
  });
  state.options.gas.addTag(player.actorId, "state.dashing", command.id, operationContext(command));
  state.acceptedCommands += 1;
}

function executeShockField(
  state: CombatState,
  player: OutpostAuthorityCombatPlayer,
  command: OutpostAuthorityCombatCommand
): void {
  const activation = state.options.gas.activateAbility({
    actorId: player.actorId,
    abilityId: "ability.outpost.shock_field",
    ...operationContext(command)
  });
  if (activation.status !== "activated") {
    rejectCommand(state, command, activation.reason);
    return;
  }
  const position = requireTransform(state.options.world, player.entityId).position;
  const enemyBodies = combatObjects(state, "enemy").map((enemy) => enemy.bodyId);
  const hits = state.options.physics.overlapShape(
    { type: "circle", radius: SHOCK_FIELD_RADIUS },
    position,
    {
      includeBodies: enemyBodies,
      triggerInteraction: "include",
      mode: "all",
      maxResults: 64
    }
  );
  const affected = new Set<string>();
  for (const hit of hits) {
    const target = combatObjectForQueryResult(state, hit);
    if (!target?.actorId || target.kind !== "enemy" || affected.has(target.actorId)) {
      continue;
    }
    affected.add(target.actorId);
    state.options.gas.applyEffect({
      effectId: SHOCK_EFFECT_ID,
      sourceActorId: player.actorId,
      targetActorId: target.actorId,
      ...operationContext(command)
    });
  }
  state.options.physicsTrace.push({
    kind: "query",
    label: "outpost.shock-field.overlap",
    entityId: player.entityId,
    ...(command.correlationId === undefined ? {} : { correlationId: command.correlationId }),
    parentId: command.parentId ?? command.id,
    payload: { affected: affected.size, radius: SHOCK_FIELD_RADIUS }
  });
  state.acceptedCommands += 1;
}

function executeTurretPlacement(
  state: CombatState,
  player: OutpostAuthorityCombatPlayer,
  command: OutpostAuthorityCombatCommand
): void {
  const definition = state.options.dataRegistry.getValue<OutpostBuildableDefinition>(
    OUTPOST_BUILDABLE_TYPE,
    TURRET_DEFINITION_ID
  );
  const origin = requireTransform(state.options.world, player.entityId).position;
  const distance = Math.hypot(command.aimX - origin.x, command.aimY - origin.y);
  if (distance > definition.placementRange || !insideArena(command.aimX, command.aimY, 20)) {
    rejectCommand(state, command, "placement-out-of-range");
    return;
  }
  const bodyData = state.options.dataRegistry.getValue<PhysicsBodyData>(
    "physics.body",
    definition.physicsBody.id
  );
  const colliderData = firstCollider(state.options.dataRegistry, bodyData);
  if (
    state.options.physics.checkOverlap(
      colliderData.shape,
      { x: command.aimX, y: command.aimY },
      {
        triggerInteraction: "exclude"
      }
    )
  ) {
    rejectCommand(state, command, "placement-obstructed");
    return;
  }
  const activation = state.options.gas.activateAbility({
    actorId: player.actorId,
    abilityId: definition.deployAbility.id,
    ...operationContext(command)
  });
  if (activation.status !== "activated") {
    rejectCommand(state, command, activation.reason);
    return;
  }
  materializeActorObject(state, {
    id: `turret.${state.nextTurretId}`,
    kind: "buildable",
    definitionId: definition.id,
    renderKey: definition.renderObject.id,
    actorDefinitionId: definition.actor.id,
    bodyData,
    colliderData,
    position: { x: command.aimX, y: command.aimY },
    sourceActorId: player.actorId,
    context: operationContext(command)
  });
  state.nextTurretId += 1;
  state.acceptedCommands += 1;
}

function ensureInitialEnemies(state: CombatState): void {
  if (state.initialWaveSpawned || state.options.players().size === 0) {
    return;
  }
  state.initialWaveSpawned = true;
  for (const spawn of state.options.initialEnemies ?? DEFAULT_ENEMY_SPAWNS) {
    const definition = state.options.dataRegistry.getValue<OutpostEnemyDefinition>(
      OUTPOST_ENEMY_TYPE,
      spawn.definitionId
    );
    const bodyData = state.options.dataRegistry.getValue<PhysicsBodyData>(
      "physics.body",
      definition.physicsBody.id
    );
    materializeActorObject(state, {
      id: spawn.id,
      kind: "enemy",
      definitionId: definition.id,
      renderKey: definition.renderObject.id,
      actorDefinitionId: definition.actor.id,
      bodyData,
      colliderData: firstCollider(state.options.dataRegistry, bodyData),
      position: { x: spawn.x, y: spawn.y },
      activationDelayMs: normalizeEnemyActivationDelay(spawn)
    });
  }
}

function updateDashes(state: CombatState, deltaMs: number): void {
  for (const [playerId, dash] of state.dashesByPlayerId) {
    const player = state.options.players().get(playerId);
    if (!player || !state.options.world.has(player.entityId)) {
      state.dashesByPlayerId.delete(playerId);
      continue;
    }
    state.options.world.set(player.entityId, PhysicsVelocityComponent, { linear: dash.velocity });
    dash.remainingMs -= Math.max(0, deltaMs);
    if (dash.remainingMs <= 0) {
      if (state.options.gas.hasActor(dash.actorId)) {
        state.options.gas.removeTag(dash.actorId, "state.dashing", dash.source);
      }
      state.dashesByPlayerId.delete(playerId);
    }
  }
}

function updateEnemySteering(state: CombatState, deltaMs: number): void {
  const players = [...state.options.players().values()].filter(
    (player) => state.options.gas.hasActor(player.actorId) && actorHealth(state, player.actorId) > 0
  );
  if (players.length === 0) {
    return;
  }
  for (const enemy of combatObjects(state, "enemy")) {
    if ((enemy.activationDelayMs ?? 0) > 0) {
      enemy.activationDelayMs = Math.max(0, (enemy.activationDelayMs ?? 0) - Math.max(0, deltaMs));
      state.options.world.set(enemy.entityId, PhysicsVelocityComponent, {
        linear: { x: 0, y: 0 }
      });
      continue;
    }
    if (
      !enemy.actorId ||
      !state.options.gas.hasActor(enemy.actorId) ||
      actorHealth(state, enemy.actorId) <= 0
    ) {
      continue;
    }
    const definition = state.options.dataRegistry.getValue<OutpostEnemyDefinition>(
      OUTPOST_ENEMY_TYPE,
      enemy.definitionId
    );
    const transform = requireTransform(state.options.world, enemy.entityId);
    const target = nearestPlayer(state.options.world, transform.position, players);
    const targetTransform = requireTransform(state.options.world, target.entityId);
    const dx = targetTransform.position.x - transform.position.x;
    const dy = targetTransform.position.y - transform.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance > definition.attackRange) {
      const scale = distance === 0 ? 0 : definition.moveSpeed / distance;
      state.options.world.set(enemy.entityId, PhysicsVelocityComponent, {
        linear: { x: dx * scale, y: dy * scale }
      });
      state.options.world.set(enemy.entityId, OutpostGameplayObject, {
        facing: Math.atan2(dy, dx)
      });
      continue;
    }
    state.options.world.set(enemy.entityId, PhysicsVelocityComponent, { linear: { x: 0, y: 0 } });
    const overlaps = state.options.physics.overlapShape(
      { type: "circle", radius: definition.attackRange },
      transform.position,
      { includeBodies: [target.bodyId], triggerInteraction: "include", mode: "any" }
    );
    if (overlaps.length === 0) {
      continue;
    }
    const correlationId = `outpost.ai.${enemy.id}`;
    const activation = state.options.gas.activateAbility({
      actorId: enemy.actorId,
      abilityId: definition.attackAbility.id,
      targetActorId: target.actorId,
      correlationId,
      parentId: enemy.id
    });
    if (activation.status === "activated") {
      applyDamage(state, target.actorId, definition.attackDamage, enemy.actorId, {
        correlationId,
        parentId: enemy.id
      });
      state.enemyAttacks += 1;
    }
  }
}

function normalizeEnemyActivationDelay(spawn: OutpostAuthorityEnemySpawn): number {
  const delayMs = spawn.activationDelayMs ?? 0;
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error(`Outpost enemy activation delay must be non-negative: ${spawn.id}`);
  }
  return delayMs;
}

function updateTurrets(state: CombatState): void {
  const enemies = combatObjects(state, "enemy").filter(
    (enemy) =>
      enemy.actorId &&
      state.options.gas.hasActor(enemy.actorId) &&
      actorHealth(state, enemy.actorId) > 0
  );
  for (const turret of combatObjects(state, "buildable")) {
    if (!turret.actorId || !state.options.gas.hasActor(turret.actorId) || enemies.length === 0) {
      continue;
    }
    const transform = requireTransform(state.options.world, turret.entityId);
    const target = nearestObject(state.options.world, transform.position, enemies);
    const targetTransform = requireTransform(state.options.world, target.entityId);
    const distance = Math.hypot(
      targetTransform.position.x - transform.position.x,
      targetTransform.position.y - transform.position.y
    );
    if (distance > TURRET_RANGE) {
      continue;
    }
    state.options.world.set(turret.entityId, OutpostGameplayObject, {
      facing: Math.atan2(
        targetTransform.position.y - transform.position.y,
        targetTransform.position.x - transform.position.x
      )
    });
    const correlationId = `outpost.turret.${turret.id}`;
    const activation = state.options.gas.activateAbility({
      actorId: turret.actorId,
      abilityId: "ability.outpost.rifle_fire",
      targetActorId: target.actorId,
      correlationId,
      parentId: turret.id
    });
    if (activation.status !== "activated") {
      continue;
    }
    const weapon = state.options.dataRegistry.getValue<OutpostWeaponDefinition>(
      OUTPOST_WEAPON_TYPE,
      RIFLE_DEFINITION_ID
    );
    const direction = normalizeVector({
      x: targetTransform.position.x - transform.position.x,
      y: targetTransform.position.y - transform.position.y
    });
    materializeProjectile(state, {
      id: `projectile.${state.nextProjectileId}`,
      bodyDefinitionId: weapon.projectileBody.id,
      renderKey: weapon.projectileRenderObject.id,
      origin: transform.position,
      direction,
      speed: weapon.projectileSpeed,
      damage: weapon.damage,
      lifetimeMs: weapon.projectileLifetimeMs,
      sourceActorId: turret.actorId,
      sourceBodyId: turret.bodyId,
      command: {
        id: turret.id,
        playerId: turret.sourceActorId ?? turret.actorId,
        ability: "rifle",
        aimX: targetTransform.position.x,
        aimY: targetTransform.position.y,
        correlationId,
        parentId: turret.id
      }
    });
    state.nextProjectileId += 1;
  }
}

function resolveProjectiles(
  state: CombatState,
  deltaMs: number,
  tick: number,
  elapsed: number
): void {
  for (const projectile of combatObjects(state, "projectile")) {
    const transform = state.options.world.get(projectile.entityId, PhysicsTransformComponent);
    if (!transform || !projectile.previousPosition) {
      removeCombatObject(state, projectile);
      continue;
    }
    const path = {
      x: transform.position.x - projectile.previousPosition.x,
      y: transform.position.y - projectile.previousPosition.y
    };
    const distance = Math.hypot(path.x, path.y);
    if (distance > 0) {
      const hit = state.options.physics.raycast(projectile.previousPosition, path, {
        maxDistance: distance,
        triggerInteraction: "include",
        mode: "closest",
        sort: "distance",
        ignoreBodies: [
          projectile.bodyId,
          ...(projectile.sourceBodyId === undefined ? [] : [projectile.sourceBodyId])
        ],
        ignoreColliders: [projectile.colliderId]
      })[0];
      if (hit) {
        const target = combatObjectForQueryResult(state, hit);
        const trace = state.options.physicsTrace.push({
          kind: "query",
          label: "outpost.projectile.sweep",
          tick,
          elapsed,
          bodyId: projectile.bodyId,
          colliderId: hit.colliderId,
          ...(projectile.correlationId === undefined
            ? {}
            : { correlationId: projectile.correlationId }),
          ...(projectile.parentId === undefined ? {} : { parentId: projectile.parentId }),
          payload: { hitEntityId: hit.entityId, distance: hit.distance ?? distance }
        });
        if (
          target?.actorId &&
          target.kind === "enemy" &&
          projectile.damage !== undefined &&
          projectile.sourceActorId
        ) {
          applyDamage(state, target.actorId, projectile.damage, projectile.sourceActorId, {
            ...(projectile.correlationId === undefined
              ? {}
              : { correlationId: projectile.correlationId }),
            parentId: trace.id
          });
          applyKnockback(state, target, path, projectile.damage * 12);
          state.projectileHits += 1;
        }
        removeCombatObject(state, projectile);
        continue;
      }
    }
    projectile.previousPosition = { ...transform.position };
    projectile.remainingMs = (projectile.remainingMs ?? 0) - Math.max(0, deltaMs);
    if (
      (projectile.remainingMs ?? 0) <= 0 ||
      !insideArena(transform.position.x, transform.position.y, 0)
    ) {
      removeCombatObject(state, projectile);
    }
  }
}

function flushDeaths(state: CombatState): void {
  for (const death of state.pendingDeaths.values()) {
    const object = state.objectsByActorId.get(death.actorId);
    if (object) {
      state.kills += object.kind === "enemy" ? 1 : 0;
      state.options.eventBus.emit(
        "outpost.entity.despawned",
        { actorId: death.actorId, entityId: object.entityId, kind: object.kind },
        "outpost.authority.combat",
        {
          correlationId: death.correlationId,
          parentId: death.parentId
        }
      );
      removeCombatObject(state, object);
      continue;
    }
    const player = [...state.options.players().values()].find(
      (candidate) => candidate.actorId === death.actorId
    );
    if (player) {
      state.options.world.set(player.entityId, PhysicsVelocityComponent, {
        linear: { x: 0, y: 0 }
      });
      state.options.gas.addTag(player.actorId, "state.dead", "outpost.actor-killed", {
        correlationId: death.correlationId,
        parentId: death.parentId
      });
    }
  }
  state.pendingDeaths.clear();
}

function applyDamage(
  state: CombatState,
  targetActorId: string,
  damage: number,
  sourceActorId: string,
  context: GasOperationContext
): void {
  if (!state.options.gas.hasActor(targetActorId)) {
    return;
  }
  const actor = state.options.gas.getActor(targetActorId);
  const health = actor.attributes.current.health ?? 0;
  if (health <= 0) {
    return;
  }
  const shield = actor.attributes.current.shield ?? 0;
  const shieldDamage = Math.min(shield, damage);
  if (shieldDamage > 0) {
    state.options.gas.modifyAttribute(
      targetActorId,
      { attribute: "shield", operation: "add", value: -shieldDamage },
      sourceActorId,
      context
    );
  }
  const healthDamage = damage - shieldDamage;
  if (healthDamage > 0) {
    state.options.gas.modifyAttribute(
      targetActorId,
      { attribute: "health", operation: "add", value: -healthDamage },
      sourceActorId,
      context
    );
  }
}

function applyKnockback(
  state: CombatState,
  target: CombatObject,
  direction: PhysicsVector,
  magnitude: number
): void {
  const normalized = normalizeVector(direction);
  state.knockbacksByObjectId.set(target.id, {
    velocity: { x: normalized.x * magnitude, y: normalized.y * magnitude },
    remainingMs: KNOCKBACK_DURATION_MS
  });
}

function updateKnockbacks(state: CombatState, deltaMs: number): void {
  for (const [objectId, knockback] of state.knockbacksByObjectId) {
    const object = state.objectsById.get(objectId);
    if (!object || !state.options.world.has(object.entityId)) {
      state.knockbacksByObjectId.delete(objectId);
      continue;
    }
    knockback.remainingMs -= Math.max(0, deltaMs);
    if (knockback.remainingMs <= 0) {
      state.knockbacksByObjectId.delete(objectId);
      continue;
    }
    state.options.world.set(object.entityId, PhysicsVelocityComponent, {
      linear: knockback.velocity
    });
  }
}
