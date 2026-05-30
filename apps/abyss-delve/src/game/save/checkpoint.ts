import { Actor, Combat, EnemyAi, Loot, Position, Presentation, Room } from "../components";
import { PLAYER_ACTOR_ID } from "../constants";
import type { AbyssRuntimeState } from "../runtime-state";
import { restoreAbyssCheckpoint } from "../modules/room-helpers";
import type {
  AbyssCheckpointActorGasState,
  AbyssCheckpointData,
  AbyssCheckpointEnemy,
  AbyssCheckpointLoot,
  AbyssCheckpointPhase,
  AbyssCheckpointPlayer
} from "./checkpoint-types";

export function captureAbyssCheckpoint(state: AbyssRuntimeState): AbyssCheckpointData {
  const room = state.roomEntity === undefined ? undefined : state.world.get(state.roomEntity, Room);
  const currentRoomId = state.activeRoomId ?? room?.roomId ?? "room.bootstrap";
  return {
    version: 1,
    runId: state.run.runId,
    seed: state.seed,
    checkpointVersion: state.run.checkpointVersion,
    roomIndex: state.run.roomIndex,
    currentRoomId,
    ...(state.activeWaveId === undefined ? {} : { activeWaveId: state.activeWaveId }),
    ...(state.activeRewardPoolId === undefined
      ? {}
      : { activeRewardPoolId: state.activeRewardPoolId }),
    phase: readPhase(state),
    completedRoomIds: [...state.run.completedRoomIds],
    selectedRewardIds: [...state.run.selectedRewardIds],
    ...(state.run.selectedReward === undefined ? {} : { selectedReward: state.run.selectedReward }),
    gold: state.run.gold,
    recentLoot: [...state.run.recentLoot],
    rewardChoices: state.run.rewardChoices.map((choice) => ({
      id: choice.id,
      selected: choice.selected
    })),
    player: capturePlayer(state),
    enemies: captureEnemies(state),
    loot: captureLoot(state)
  };
}

export function applyAbyssCheckpoint(
  state: AbyssRuntimeState,
  checkpoint: AbyssCheckpointData
): void {
  restoreAbyssCheckpoint(state, checkpoint);
  state.trace({
    kind: "runtime",
    label: "checkpoint restored",
    payload: {
      roomId: checkpoint.currentRoomId,
      roomIndex: checkpoint.roomIndex
    }
  });
}

function readPhase(state: AbyssRuntimeState): AbyssCheckpointPhase {
  const room = state.roomEntity === undefined ? undefined : state.world.get(state.roomEntity, Room);
  if (state.run.rewardOpen || room?.rewardOpen) {
    return "reward";
  }
  if (state.run.completed || room?.completed) {
    return "complete";
  }
  return "combat";
}

function capturePlayer(state: AbyssRuntimeState): AbyssCheckpointPlayer {
  const player = state.playerEntity;
  if (player === undefined) {
    throw new Error("Cannot capture Abyss checkpoint without player entity");
  }
  const actor = state.world.get(player, Actor);
  const position = state.world.get(player, Position);
  const combat = state.world.get(player, Combat);
  if (!actor || !position || !combat) {
    throw new Error("Cannot capture Abyss checkpoint with incomplete player state");
  }
  const gas = captureGas(state, actor.actorId);
  return {
    actorId: actor.actorId,
    definitionId: actor.definitionId,
    archetypeId: actor.archetypeId,
    label: actor.label,
    position: { ...position },
    combat: { ...combat },
    ...(gas === undefined ? {} : { gas })
  };
}

function captureEnemies(state: AbyssRuntimeState): AbyssCheckpointEnemy[] {
  const enemies: AbyssCheckpointEnemy[] = [];
  for (const entity of state.world.query([Actor, Combat, Position, EnemyAi])) {
    const actor = state.world.get(entity, Actor);
    const combat = state.world.get(entity, Combat);
    const position = state.world.get(entity, Position);
    const ai = state.world.get(entity, EnemyAi);
    if (!actor || !combat || !position || !ai || actor.faction !== "enemy" || !actor.alive) {
      continue;
    }
    const gas = captureGas(state, actor.actorId);
    enemies.push({
      actorId: actor.actorId,
      definitionId: actor.definitionId,
      archetypeId: actor.archetypeId,
      label: actor.label,
      role: actor.role,
      position: { ...position },
      combat: { ...combat },
      ai: { ...ai },
      ...(gas === undefined ? {} : { gas })
    });
  }
  return enemies;
}

function captureLoot(state: AbyssRuntimeState): AbyssCheckpointLoot[] {
  const lootEntries: AbyssCheckpointLoot[] = [];
  for (const entity of state.world.query([Loot, Position, Presentation])) {
    const loot = state.world.get(entity, Loot);
    const position = state.world.get(entity, Position);
    const presentation = state.world.get(entity, Presentation);
    if (!loot || !position || !presentation || loot.picked) {
      continue;
    }
    lootEntries.push({
      lootId: loot.lootId,
      label: loot.label,
      kind: loot.kind,
      amount: loot.amount,
      ...(loot.sourceActorId === undefined ? {} : { sourceActorId: loot.sourceActorId }),
      position: { ...position },
      renderKey: presentation.renderKey,
      layer: presentation.layer
    });
  }
  return lootEntries;
}

function captureGas(
  state: AbyssRuntimeState,
  actorId: string
): AbyssCheckpointActorGasState | undefined {
  const gas = state.gasRuntime();
  if (!gas?.hasActor(actorId)) {
    return undefined;
  }
  const actor = gas.getActor(actorId);
  return {
    actor: {
      actorId: actor.actor.actorId,
      definitionId: actor.actor.definitionId
    },
    attributes: {
      base: { ...actor.attributes.base },
      current: { ...actor.attributes.current }
    },
    tags: { values: [...actor.tags.values] },
    abilities: {
      ids: [...actor.abilities.ids],
      cooldowns: { ...actor.abilities.cooldowns },
      disabled: [...actor.abilities.disabled]
    },
    effects: {
      active: actor.effects.active.map((effect) => ({ ...effect }))
    }
  };
}

export function resetAbyssTransientState(state: AbyssRuntimeState): void {
  state.input.attackRequested = false;
  state.input.skillPrimaryRequested = false;
  state.input.skillSecondaryRequested = false;
  state.input.dodgeRequested = false;
  state.input.interactRequested = false;
  state.input.inventoryToggleRequested = false;
  state.input.pauseToggleRequested = false;
  state.input.rewardChoiceRequested = undefined;
  state.input.gameplayBlocked = false;
  state.run.inventoryOpen = false;
  state.run.paused = false;

  const player = state.playerEntity;
  if (player !== undefined) {
    const actor = state.world.get(player, Actor);
    if (actor?.actorId === PLAYER_ACTOR_ID) {
      actor.alive = true;
      state.world.set(player, Actor, actor);
    }
  }
}
