import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { PLAYER_ACTOR_ID } from "../constants";
import {
  Actor,
  Combat,
  EnemyAi,
  Hitbox,
  PlayerControl,
  Position,
  Presentation,
  Room,
  Velocity
} from "../components";
import type {
  AbyssEnemyProfile,
  AbyssHeroClass,
  AbyssRoomTemplate,
  AbyssWaveProfile
} from "../content";
import { ABYSS_ENEMY_TYPE, ABYSS_HERO_TYPE, ABYSS_ROOM_TYPE, ABYSS_WAVE_TYPE } from "../content";
import type { AbyssRuntimeState } from "../runtime-state";

export function createAbyssRoomModule(state: AbyssRuntimeState) {
  return defineGameModule<GameInstallContext>({
    id: "abyss.room",
    install({ world }) {
      const room = state.dataRegistry.getValue<AbyssRoomTemplate>(
        ABYSS_ROOM_TYPE,
        "room.bootstrap"
      );
      const hero = state.dataRegistry.getValue<AbyssHeroClass>(ABYSS_HERO_TYPE, room.heroClassId);
      const wave =
        room.waveProfileId === undefined
          ? undefined
          : state.dataRegistry.getValue<AbyssWaveProfile>(ABYSS_WAVE_TYPE, room.waveProfileId);
      const roomEntity = world.spawn();
      state.activeRoomId = room.id;
      state.activeWaveId = wave?.id;
      state.activeRewardPoolId = room.rewardPoolId;
      state.roomEntity = roomEntity;
      world.add(roomEntity, Room, { roomId: room.id });

      const player = world.spawn();
      state.playerEntity = player;
      world.add(player, Position, { x: hero.spawn.x, y: hero.spawn.y });
      world.add(player, Velocity);
      world.add(player, Hitbox, { radius: 18 });
      world.add(player, Actor, {
        actorId: PLAYER_ACTOR_ID,
        definitionId: hero.actorDefinitionId,
        archetypeId: hero.id,
        label: hero.label,
        faction: "player",
        role: "player"
      });
      world.add(player, Combat, {
        health: 160,
        maxHealth: 160,
        energy: 100,
        maxEnergy: 100,
        damage: 18,
        attackRange: 82,
        attackCooldownMs: 340
      });
      world.add(player, PlayerControl);
      world.add(player, Presentation, { renderKey: hero.renderObjectId, layer: 10 });
      state.gasRuntime()?.createActor({
        actorId: PLAYER_ACTOR_ID,
        definitionId: hero.actorDefinitionId,
        entityId: player
      });

      const spawns = createSpawnList(wave);
      spawns.forEach((spawn, index) => {
        const profile = state.dataRegistry.getValue<AbyssEnemyProfile>(
          ABYSS_ENEMY_TYPE,
          spawn.profileId
        );
        const entity = world.spawn();
        const actorId = `abyss.enemy.${index}.${profile.role}`;
        world.add(entity, Position, { x: spawn.x, y: spawn.y });
        world.add(entity, Velocity);
        world.add(entity, Hitbox, { radius: profile.radius });
        world.add(entity, Actor, {
          actorId,
          definitionId: profile.actorDefinitionId,
          archetypeId: profile.id,
          label: profile.label,
          faction: "enemy",
          role: profile.role
        });
        world.add(entity, Combat, {
          health: profile.maxHealth,
          maxHealth: profile.maxHealth,
          energy: 0,
          maxEnergy: 0,
          damage: profile.damage,
          attackRange: profile.attackRange,
          attackCooldownMs: profile.attackCooldownMs
        });
        world.add(entity, EnemyAi, {
          behavior:
            profile.role === "ranged" ? "kite" : profile.role === "heavy" ? "brute" : "chase",
          preferredRange: profile.role === "ranged" ? 240 : profile.attackRange
        });
        world.add(entity, Presentation, { renderKey: profile.renderObjectId, layer: 8 });
        state.gasRuntime()?.createActor({
          actorId,
          definitionId: profile.actorDefinitionId,
          entityId: entity
        });
      });

      state.eventBus.emit(
        "abyss.room_entered",
        { roomId: room.id, waveId: wave?.id, enemies: spawns.length },
        "abyss.room"
      );
      state.trace({ kind: "runtime", label: "Entered Forsaken Antechamber" });
    }
  });
}

function createSpawnList(wave: AbyssWaveProfile | undefined): Array<{
  profileId: string;
  x: number;
  y: number;
}> {
  if (!wave) {
    return [];
  }

  return wave.spawns.flatMap((spawn) =>
    Array.from({ length: spawn.count ?? 1 }, (_, index) => ({
      profileId: spawn.profileId,
      x: spawn.x + index * 28,
      y: spawn.y + index * 22
    }))
  );
}
