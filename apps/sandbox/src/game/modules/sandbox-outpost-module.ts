import { defineGameModule } from "@gamekit/core";
import type { GasRuntime } from "@gamekit/gas";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { RenderObjectDefinition } from "@gamekit/renderer-core";
import type { EntityId } from "@gamekit/world";
import {
  LinkState,
  ObjectiveState,
  Position,
  ProductionState,
  RenderObjectPresentation,
  SceneObject,
  Selectable,
  StationState,
  SignalStorage,
  ThreatState,
  Velocity,
  WorkAssignment
} from "../components";
import type {
  SandboxObjectivePhaseDefinition,
  SandboxSceneLayoutDefinition,
  SandboxSceneObjectDefinition,
  SandboxRenderRigDefinition,
  SandboxStationDefinition
} from "../sandbox-data";

const SCOUT_SPEED = 20;
const SIGNAL_LOAD_PER_TRIP = 18;
const BOOTSTRAP_OBJECTIVE_PHASE_ID = "objective.sandbox.phase.bootstrap";
const COMMAND_CORE_OBJECT_ID = "scene.sandbox.command_core";

export type SandboxOutpostModuleOptions = {
  layout: SandboxSceneLayoutDefinition;
  sceneObjects: SandboxSceneObjectDefinition[];
  renderObject: (id: string) => RenderObjectDefinition;
  renderRig: (id: string) => SandboxRenderRigDefinition;
  stationDefinition: (id: string) => SandboxStationDefinition;
  objectivePhase: (id: string) => SandboxObjectivePhaseDefinition;
  gasRuntime?: (() => GasRuntime | undefined) | undefined;
};

export function createSandboxOutpostModule(options: SandboxOutpostModuleOptions) {
  return defineGameModule<GameInstallContext>({
    id: "sandbox.outpost",
    install(ctx) {
      const entitiesByObjectId = new Map<string, EntityId>();
      const relayObjectIds = options.sceneObjects
        .filter((object) => object.role === "relay-tower")
        .map((object) => object.id);
      const coreObjectId = COMMAND_CORE_OBJECT_ID;

      let order = 0;
      for (const object of options.sceneObjects) {
        const entity = spawnSceneObject(ctx, options, object, order);
        entitiesByObjectId.set(object.id, entity);
        order += 1;
      }

      for (let i = 0; i < options.layout.scoutCount; i += 1) {
        const entity = spawnScout(
          ctx,
          options,
          i,
          order + i,
          relayObjectIds[i % relayObjectIds.length]
        );
        entitiesByObjectId.set(`scene.sandbox.scout.${i}`, entity);
      }

      for (const link of options.layout.links) {
        const from = entitiesByObjectId.get(link.fromObjectId);
        const to = entitiesByObjectId.get(link.toObjectId);
        if (from === undefined || to === undefined) {
          continue;
        }

        const entity = ctx.world.spawn();
        const fromPosition = ctx.world.get(from, Position);
        const toPosition = ctx.world.get(to, Position);
        ctx.world.add(entity, Position, midpoint(fromPosition, toPosition));
        ctx.world.add(entity, SceneObject, {
          objectId: link.id,
          label: link.id.replace("link.", "").replaceAll("_", " "),
          role: "signal-link",
          dataKind: "sceneLayout",
          dataId: options.layout.id
        });
        ctx.world.add(entity, LinkState, {
          fromObjectId: link.fromObjectId,
          toObjectId: link.toObjectId,
          status: link.corrupted ? "corrupted" : "idle"
        });
        ctx.world.add(entity, RenderObjectPresentation, {
          definition: createRenderableDefinition(options.renderObject("render.sandbox.signal_link"))
        });
      }

      ctx.eventBus.emit(
        "sandbox.outpost_spawned",
        { layoutId: options.layout.id, objects: entitiesByObjectId.size },
        "sandbox.outpost"
      );

      ctx.systems.register({
        id: "sandbox.outpost_production_system",
        update({ world, delta, tick }) {
          const seconds = delta / 1000;
          for (const entity of world.query([ProductionState, SignalStorage, SceneObject])) {
            const production = world.get(entity, ProductionState);
            const storage = world.get(entity, SignalStorage);
            const object = world.get(entity, SceneObject);
            const station = world.get(entity, StationState);
            if (!production || !storage || !object || production.ratePerSecond <= 0) {
              continue;
            }

            const stabilityRatio = station ? Math.max(0.25, station.stability / 100) : 1;
            const heatPenalty = station ? Math.max(0.45, 1 - station.heat / 180) : 1;
            const effectiveRate =
              production.ratePerSecond * (station?.throughput ?? 1) * stabilityRatio * heatPenalty;
            const nextSignal = Math.min(storage.capacity, storage.signal + effectiveRate * seconds);
            world.set(entity, SignalStorage, {
              ...storage,
              signal: nextSignal
            });
            if (station) {
              world.set(entity, StationState, {
                ...station,
                heat: clamp(
                  station.heat +
                    (nextSignal >= storage.capacity ? -7 : effectiveRate * 0.24) * seconds,
                  0,
                  100
                ),
                stability: clamp(station.stability - station.heat * 0.006 * seconds, 35, 100)
              });
            }
            world.set(entity, ProductionState, {
              ...production,
              status: nextSignal >= storage.capacity ? "blocked" : "producing"
            });

            if (tick % 90 === 0) {
              ctx.eventBus.emit(
                "sandbox.signal_produced",
                { objectId: object.objectId, signal: Math.round(nextSignal) },
                "sandbox.outpost.production"
              );
            }
          }
        }
      });

      ctx.systems.register({
        id: "sandbox.outpost_station_process_system",
        update({ world, delta, tick }) {
          const seconds = delta / 1000;
          for (const entity of world.query([SceneObject, SignalStorage, StationState])) {
            const object = world.get(entity, SceneObject);
            const storage = world.get(entity, SignalStorage);
            const station = world.get(entity, StationState);
            if (!object || !storage || !station) {
              continue;
            }

            if (object.role === "asset-fabricator" && storage.signal >= 18) {
              const produced = Math.min(2 * seconds, 4 - storage.fragments);
              if (produced > 0) {
                world.set(entity, SignalStorage, {
                  ...storage,
                  signal: storage.signal - produced * 9,
                  fragments: storage.fragments + produced
                });
              }
            }

            if (object.role === "data-node" && storage.fragments >= 2) {
              const decoded = Math.min(0.45 * seconds, storage.fragments);
              world.set(entity, SignalStorage, {
                ...storage,
                fragments: storage.fragments - decoded,
                signal: Math.min(storage.capacity, storage.signal + decoded * 4)
              });
            }

            if (tick % 180 === 0 && station.heat > 60) {
              ctx.eventBus.emit(
                "sandbox.station_heat_warning",
                {
                  objectId: object.objectId,
                  heat: Math.round(station.heat),
                  stability: Math.round(station.stability)
                },
                "sandbox.outpost.station"
              );
            }
          }
        }
      });

      ctx.systems.register({
        id: "sandbox.outpost_scout_work_system",
        update({ world, delta, tick }) {
          const seconds = delta / 1000;
          const coreEntity = entitiesByObjectId.get(coreObjectId);
          if (coreEntity === undefined) {
            return;
          }

          for (const entity of world.query([SceneObject, Position, WorkAssignment])) {
            const object = world.get(entity, SceneObject);
            const position = world.get(entity, Position);
            const work = world.get(entity, WorkAssignment);
            const storage = world.get(entity, SignalStorage);
            if (!object || object.role !== "scout" || !position || !work || !storage) {
              continue;
            }

            const activeWork =
              work.task === "idle" || !work.targetObjectId
                ? assignNextScoutWork(world, entitiesByObjectId, relayObjectIds, work)
                : work;
            if (activeWork !== work) {
              world.set(entity, WorkAssignment, activeWork);
            }

            const targetObjectId = activeWork.targetObjectId ?? coreObjectId;
            const targetEntity = entitiesByObjectId.get(targetObjectId);
            const targetPosition =
              targetEntity === undefined ? undefined : world.get(targetEntity, Position);
            if (!targetPosition) {
              continue;
            }

            const fatiguePenalty = Math.max(0.55, 1 - activeWork.fatigue / 160);
            const batteryPenalty = Math.max(0.5, activeWork.battery / 100);
            const nextPosition = moveToward(
              position,
              targetPosition,
              SCOUT_SPEED * fatiguePenalty * batteryPenalty * seconds
            );
            world.set(entity, Velocity, {
              x: nextPosition.x - position.x,
              y: nextPosition.y - position.y
            });
            world.set(entity, Position, nextPosition);

            const distance = distanceBetween(nextPosition, targetPosition);
            if (distance > 1.4) {
              world.set(entity, WorkAssignment, {
                ...activeWork,
                status: "routing",
                targetObjectId,
                progress: Math.max(0, 1 - distance / 70),
                routeProgress: Math.max(0, 1 - distance / 84),
                battery: clamp(activeWork.battery - seconds * 1.9, 0, 100),
                fatigue: clamp(activeWork.fatigue + seconds * 0.85, 0, 100)
              });
              continue;
            }

            if (activeWork.task === "collect") {
              const relayStorage =
                targetEntity === undefined ? undefined : world.get(targetEntity, SignalStorage);
              const load = Math.min(
                SIGNAL_LOAD_PER_TRIP,
                relayStorage?.signal ?? 0,
                storage.capacity - storage.signal
              );
              if (targetEntity !== undefined && relayStorage && load > 0) {
                world.set(targetEntity, SignalStorage, {
                  ...relayStorage,
                  signal: relayStorage.signal - load
                });
              }
              world.set(entity, SignalStorage, {
                ...storage,
                signal: storage.signal + load
              });
              world.set(entity, WorkAssignment, {
                task: "deliver",
                status: "returning",
                sourceObjectId: targetObjectId,
                targetObjectId: chooseDeliveryTarget(world, entitiesByObjectId, coreObjectId),
                cargo: storage.signal + load,
                battery: clamp(activeWork.battery - 1, 0, 100),
                fatigue: clamp(activeWork.fatigue + 1.8, 0, 100),
                progress: 0,
                routeProgress: 0
              });
              if (load > 0) {
                ctx.eventBus.emit(
                  "sandbox.signal_loaded",
                  { scout: object.objectId, from: targetObjectId, amount: Math.round(load) },
                  "sandbox.outpost.scout"
                );
              }
              continue;
            }

            if (activeWork.task === "deliver") {
              const targetStorage =
                targetEntity === undefined ? undefined : world.get(targetEntity, SignalStorage);
              const delivered = Math.min(
                storage.signal,
                targetStorage ? targetStorage.capacity - targetStorage.signal : 0
              );
              if (targetEntity !== undefined && targetStorage && delivered > 0) {
                world.set(targetEntity, SignalStorage, {
                  ...targetStorage,
                  signal: Math.min(targetStorage.capacity, targetStorage.signal + delivered)
                });
                const objective = world.get(targetEntity, ObjectiveState);
                if (objective) {
                  world.set(targetEntity, ObjectiveState, {
                    ...objective,
                    progressSignal: Math.min(
                      objective.targetSignal,
                      objective.progressSignal + delivered
                    )
                  });
                }
              }
              world.set(entity, SignalStorage, {
                ...storage,
                signal: 0
              });
              if (targetObjectId === coreObjectId) {
                const coreStation = world.get(coreEntity, StationState);
                if (coreStation) {
                  world.set(coreEntity, StationState, {
                    ...coreStation,
                    heat: clamp(coreStation.heat + delivered * 0.08, 0, 100)
                  });
                }
              }
              ctx.eventBus.emit(
                "sandbox.signal_delivered",
                { scout: object.objectId, to: targetObjectId, amount: Math.round(delivered) },
                "sandbox.outpost.scout"
              );
              world.set(entity, WorkAssignment, {
                ...assignNextScoutWork(world, entitiesByObjectId, relayObjectIds, activeWork),
                battery: clamp(activeWork.battery - 2, 0, 100),
                fatigue: clamp(activeWork.fatigue + 2.2, 0, 100)
              });
              continue;
            }

            if (activeWork.task === "repair") {
              const station =
                targetEntity === undefined ? undefined : world.get(targetEntity, StationState);
              if (targetEntity !== undefined && station) {
                world.set(targetEntity, StationState, {
                  ...station,
                  stability: clamp(station.stability + 14, 0, 100),
                  heat: clamp(station.heat - 18, 0, 100),
                  mode: "stabilize"
                });
              }
              ctx.eventBus.emit(
                "sandbox.station_repaired",
                { scout: object.objectId, target: targetObjectId },
                "sandbox.outpost.scout"
              );
              world.set(entity, WorkAssignment, {
                ...assignNextScoutWork(world, entitiesByObjectId, relayObjectIds, activeWork),
                battery: clamp(activeWork.battery - 6, 0, 100),
                fatigue: clamp(activeWork.fatigue + 6, 0, 100)
              });
              continue;
            }

            if (activeWork.task === "suppress") {
              const threat =
                targetEntity === undefined ? undefined : world.get(targetEntity, ThreatState);
              if (targetEntity !== undefined && threat) {
                world.set(targetEntity, ThreatState, {
                  ...threat,
                  intensity: clamp(threat.intensity - 0.18, 0, 1),
                  status: "cooldown"
                });
              }
              ctx.eventBus.emit(
                "sandbox.threat_suppressed",
                { scout: object.objectId, target: targetObjectId },
                "sandbox.outpost.scout"
              );
              world.set(entity, WorkAssignment, {
                ...assignNextScoutWork(world, entitiesByObjectId, relayObjectIds, activeWork),
                battery: clamp(activeWork.battery - 8, 0, 100),
                fatigue: clamp(activeWork.fatigue + 8, 0, 100)
              });
              continue;
            }

            if (activeWork.task === "scan") {
              const targetStorage =
                targetEntity === undefined ? undefined : world.get(targetEntity, SignalStorage);
              if (targetEntity !== undefined && targetStorage) {
                world.set(targetEntity, SignalStorage, {
                  ...targetStorage,
                  fragments: Math.min(8, targetStorage.fragments + 0.5)
                });
              }
              ctx.eventBus.emit(
                "sandbox.station_scanned",
                { scout: object.objectId, target: targetObjectId },
                "sandbox.outpost.scout"
              );
              world.set(entity, WorkAssignment, {
                ...assignNextScoutWork(world, entitiesByObjectId, relayObjectIds, activeWork),
                battery: clamp(activeWork.battery - 3, 0, 100),
                fatigue: clamp(activeWork.fatigue + 3.5, 0, 100)
              });
            }
          }

          if (tick % 60 === 0) {
            ctx.eventBus.emit("sandbox.motion_tick", { tick }, "sandbox.outpost");
            ctx.eventBus.emit("sandbox.outpost_tick", { tick }, "sandbox.outpost");
          }
        }
      });

      ctx.systems.register({
        id: "sandbox.outpost_threat_system",
        update({ world, tick }) {
          for (const entity of world.query([ThreatState, SceneObject])) {
            const threat = world.get(entity, ThreatState);
            const object = world.get(entity, SceneObject);
            if (!threat || !object || tick < threat.nextStrikeTick) {
              continue;
            }

            const targetId =
              relayObjectIds[((tick / 150) % relayObjectIds.length) | 0] ?? coreObjectId;
            const targetEntity = entitiesByObjectId.get(targetId);
            const targetObject =
              targetEntity === undefined ? undefined : world.get(targetEntity, SceneObject);
            const targetStorage =
              targetEntity === undefined ? undefined : world.get(targetEntity, SignalStorage);
            const targetStation =
              targetEntity === undefined ? undefined : world.get(targetEntity, StationState);
            if (targetEntity !== undefined && targetStorage) {
              world.set(targetEntity, SignalStorage, {
                ...targetStorage,
                signal: Math.max(0, targetStorage.signal - 10)
              });
            }
            if (targetEntity !== undefined && targetStation) {
              world.set(targetEntity, StationState, {
                ...targetStation,
                stability: clamp(targetStation.stability - 12, 0, 100),
                heat: clamp(targetStation.heat + 16, 0, 100),
                mode: "suppressed"
              });
            }

            const gas = options.gasRuntime?.();
            if (targetObject?.actorId && gas?.hasActor(targetObject.actorId)) {
              gas.applyEffect({
                effectId: "gas.effect.sandbox.interference_mark",
                sourceActorId: object.actorId,
                targetActorId: targetObject.actorId
              });
            }

            world.set(entity, ThreatState, {
              intensity: Math.min(1, threat.intensity + 0.12),
              nextStrikeTick: tick + 150,
              status: "striking"
            });
            ctx.eventBus.emit(
              "sandbox.interference_strike",
              { source: object.objectId, target: targetId },
              "sandbox.outpost.threat"
            );
          }
        }
      });

      ctx.systems.register({
        id: "sandbox.outpost_link_system",
        update({ world }) {
          for (const entity of world.query([LinkState])) {
            const link = world.get(entity, LinkState);
            if (!link) {
              continue;
            }

            const fromEntity = entitiesByObjectId.get(link.fromObjectId);
            const fromStorage =
              fromEntity === undefined ? undefined : world.get(fromEntity, SignalStorage);
            const flow =
              fromStorage && fromStorage.capacity > 0
                ? Math.min(1, fromStorage.signal / fromStorage.capacity)
                : link.status === "corrupted"
                  ? 0.55
                  : 0.18;

            world.set(entity, LinkState, {
              ...link,
              flow,
              status:
                link.status === "corrupted"
                  ? "corrupted"
                  : flow > 0.82
                    ? "overloaded"
                    : flow > 0.08
                      ? "flowing"
                      : "idle"
            });
          }
        }
      });

      ctx.systems.register({
        id: "sandbox.outpost_objective_system",
        update({ world, tick }) {
          const coreEntity = entitiesByObjectId.get(coreObjectId);
          const coreStorage =
            coreEntity === undefined ? undefined : world.get(coreEntity, SignalStorage);
          const objective =
            coreEntity === undefined ? undefined : world.get(coreEntity, ObjectiveState);
          if (!coreStorage || !objective) {
            return;
          }

          const progress = Math.min(1, objective.progressSignal / objective.targetSignal);
          if (tick > 0 && tick % 120 === 0) {
            ctx.eventBus.emit(
              "sandbox.objective_progress",
              {
                phaseId: objective.phaseId,
                progress: Math.round(progress * 100),
                signal: Math.round(objective.progressSignal)
              },
              "sandbox.outpost.objective"
            );
          }
        }
      });
    }
  });
}

function spawnSceneObject(
  ctx: GameInstallContext,
  options: SandboxOutpostModuleOptions,
  object: SandboxSceneObjectDefinition,
  order: number
): EntityId {
  const entity = ctx.world.spawn();
  const actorId = object.gasActorDefinitionId
    ? `gas.actor.sandbox.${object.id.replace("scene.sandbox.", "").replaceAll("_", ".")}`
    : undefined;

  ctx.world.add(entity, Position, { x: object.x, y: object.y });
  ctx.world.add(entity, SceneObject, {
    objectId: object.id,
    label: object.label,
    role: object.role,
    dataKind: "sceneObject",
    dataId: object.id,
    actorId
  });
  ctx.world.add(entity, Selectable, { order, selected: order === 0 });
  ctx.world.add(
    entity,
    RenderObjectPresentation,
    createPresentationData(
      createRenderableDefinition(options.renderObject(object.renderObjectId)),
      object.renderRigId ? options.renderRig(object.renderRigId).nodeAnimations : undefined
    )
  );

  if (object.capacity !== undefined) {
    ctx.world.add(entity, SignalStorage, {
      capacity: object.capacity,
      signal: object.role === "relay-tower" ? 18 : 0
    });
  }
  if (object.stationDefinitionId) {
    const station = options.stationDefinition(object.stationDefinitionId);
    ctx.world.add(entity, StationState, {
      stationId: station.id,
      zone: station.zone,
      priority: station.priority,
      stability: station.initialStability,
      heat: station.baseHeat,
      throughput: station.throughput,
      mode: "normal"
    });
  }
  if (object.productionRate !== undefined) {
    ctx.world.add(entity, ProductionState, {
      ratePerSecond: object.productionRate,
      recipeId: object.productionRecipeId,
      status: "producing"
    });
  }
  if (object.role === "command-core") {
    const objective = options.objectivePhase(BOOTSTRAP_OBJECTIVE_PHASE_ID);
    ctx.world.add(entity, ObjectiveState, {
      objectiveId: "objective.sandbox.signal_outpost",
      phaseId: objective.id,
      progressSignal: 0,
      targetSignal: objective.targetSignal,
      unlocked: []
    });
  }
  if (object.role === "interference-node") {
    ctx.world.add(entity, ThreatState, {
      intensity: 0.18,
      nextStrikeTick: 120,
      status: "charging"
    });
  }
  if (actorId && object.gasActorDefinitionId) {
    options.gasRuntime?.()?.createActor({
      actorId,
      definitionId: object.gasActorDefinitionId,
      entityId: entity
    });
  }
  ctx.eventBus.emit(
    "sandbox.entity_spawned",
    { entity, objectId: object.id, role: object.role },
    "sandbox.outpost"
  );
  return entity;
}

function spawnScout(
  ctx: GameInstallContext,
  options: SandboxOutpostModuleOptions,
  index: number,
  order: number,
  firstTargetObjectId: string | undefined
): EntityId {
  const entity = ctx.world.spawn();
  const actorId = `gas.actor.sandbox.scout.${index}`;
  const x = 38 + (index % 3) * 6;
  const y = 58 + Math.floor(index / 3) * 7;

  ctx.world.add(entity, Position, { x, y });
  ctx.world.add(entity, Velocity, { x: 0, y: 0 });
  ctx.world.add(entity, SceneObject, {
    objectId: `scene.sandbox.scout.${index}`,
    label: `Scout ${index + 1}`,
    role: "scout",
    dataKind: "gas.actor",
    dataId: "gas.actor.sandbox.scout",
    actorId
  });
  ctx.world.add(entity, Selectable, { order, selected: false });
  ctx.world.add(entity, SignalStorage, { signal: 0, capacity: SIGNAL_LOAD_PER_TRIP });
  ctx.world.add(entity, WorkAssignment, {
    task: "collect",
    status: "routing",
    sourceObjectId: COMMAND_CORE_OBJECT_ID,
    targetObjectId: firstTargetObjectId,
    cargo: 0,
    battery: 100,
    fatigue: 0,
    progress: 0,
    routeProgress: 0
  });
  ctx.world.add(entity, RenderObjectPresentation, {
    definition: createRenderableDefinition(options.renderObject("render.sandbox.scout")),
    nodeAnimations: options.renderRig("renderRig.sandbox.scout").nodeAnimations
  });
  options.gasRuntime?.()?.createActor({
    actorId,
    definitionId: "gas.actor.sandbox.scout",
    entityId: entity,
    abilities: [
      "gas.ability.sandbox.signal_strike",
      "gas.ability.sandbox.overcharge",
      "gas.ability.sandbox.field_repair"
    ]
  });
  ctx.eventBus.emit(
    "sandbox.entity_spawned",
    { entity, objectId: `scene.sandbox.scout.${index}`, role: "scout" },
    "sandbox.outpost"
  );
  return entity;
}

function chooseRelayTarget(
  world: GameInstallContext["world"],
  entitiesByObjectId: Map<string, EntityId>,
  relayObjectIds: string[]
): string {
  let bestId = relayObjectIds[0] ?? "scene.sandbox.command_core";
  let bestSignal = Number.NEGATIVE_INFINITY;
  for (const relayId of relayObjectIds) {
    const entity = entitiesByObjectId.get(relayId);
    const storage = entity === undefined ? undefined : world.get(entity, SignalStorage);
    const signal = storage?.signal ?? 0;
    if (signal > bestSignal) {
      bestSignal = signal;
      bestId = relayId;
    }
  }
  return bestId;
}

function assignNextScoutWork(
  world: GameInstallContext["world"],
  entitiesByObjectId: Map<string, EntityId>,
  relayObjectIds: string[],
  previous: ReturnType<typeof WorkAssignment.create>
): ReturnType<typeof WorkAssignment.create> {
  const repairTarget = chooseRepairTarget(world, entitiesByObjectId);
  if (repairTarget) {
    return {
      ...previous,
      task: "repair",
      status: "routing",
      sourceObjectId: previous.targetObjectId,
      targetObjectId: repairTarget,
      cargo: 0,
      progress: 0,
      routeProgress: 0
    };
  }

  const suppressTarget = chooseSuppressTarget(world, entitiesByObjectId);
  if (suppressTarget) {
    return {
      ...previous,
      task: "suppress",
      status: "routing",
      sourceObjectId: previous.targetObjectId,
      targetObjectId: suppressTarget,
      cargo: 0,
      progress: 0,
      routeProgress: 0
    };
  }

  if (previous.battery < 22 || previous.fatigue > 72) {
    return {
      ...previous,
      task: "scan",
      status: "routing",
      sourceObjectId: previous.targetObjectId,
      targetObjectId: chooseSupportTarget(world, entitiesByObjectId),
      cargo: 0,
      battery: clamp(previous.battery + 18, 0, 100),
      fatigue: clamp(previous.fatigue - 20, 0, 100),
      progress: 0,
      routeProgress: 0
    };
  }

  return {
    ...previous,
    task: "collect",
    status: "routing",
    sourceObjectId: previous.targetObjectId,
    targetObjectId: chooseRelayTarget(world, entitiesByObjectId, relayObjectIds),
    cargo: 0,
    progress: 0,
    routeProgress: 0
  };
}

function chooseRepairTarget(
  world: GameInstallContext["world"],
  entitiesByObjectId: Map<string, EntityId>
): string | undefined {
  let best: { objectId: string; urgency: number } | undefined;
  for (const [objectId, entity] of entitiesByObjectId) {
    const station = world.get(entity, StationState);
    if (!station || station.zone === "rift") {
      continue;
    }
    const urgency = (100 - station.stability) * station.priority + station.heat * 0.25;
    if (urgency > 36 && (!best || urgency > best.urgency)) {
      best = { objectId, urgency };
    }
  }
  return best?.objectId;
}

function chooseSuppressTarget(
  world: GameInstallContext["world"],
  entitiesByObjectId: Map<string, EntityId>
): string | undefined {
  for (const [objectId, entity] of entitiesByObjectId) {
    const threat = world.get(entity, ThreatState);
    if (threat && threat.intensity > 0.42) {
      return objectId;
    }
  }
  return undefined;
}

function chooseSupportTarget(
  world: GameInstallContext["world"],
  entitiesByObjectId: Map<string, EntityId>
): string {
  let bestId = COMMAND_CORE_OBJECT_ID;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const [objectId, entity] of entitiesByObjectId) {
    const object = world.get(entity, SceneObject);
    const station = world.get(entity, StationState);
    if (
      !object ||
      !station ||
      (object.role !== "data-node" && object.role !== "asset-fabricator")
    ) {
      continue;
    }
    if (station.priority > bestPriority) {
      bestPriority = station.priority;
      bestId = objectId;
    }
  }
  return bestId;
}

function chooseDeliveryTarget(
  world: GameInstallContext["world"],
  entitiesByObjectId: Map<string, EntityId>,
  coreObjectId: string
): string {
  let bestId = coreObjectId;
  let bestScore = 0;
  for (const [objectId, entity] of entitiesByObjectId) {
    const object = world.get(entity, SceneObject);
    const storage = world.get(entity, SignalStorage);
    const station = world.get(entity, StationState);
    if (
      !object ||
      !storage ||
      !station ||
      !["command-core", "data-node", "asset-fabricator"].includes(object.role)
    ) {
      continue;
    }
    const need = Math.max(0, storage.capacity - storage.signal);
    const score = need * station.priority * (object.role === "command-core" ? 1.2 : 0.78);
    if (score > bestScore) {
      bestScore = score;
      bestId = objectId;
    }
  }
  return bestId;
}

function moveToward(
  current: ReturnType<typeof Position.create>,
  target: ReturnType<typeof Position.create>,
  distance: number
): ReturnType<typeof Position.create> {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance || length === 0) {
    return { x: target.x, y: target.y };
  }
  return {
    x: current.x + (dx / length) * distance,
    y: current.y + (dy / length) * distance
  };
}

function midpoint(
  from: ReturnType<typeof Position.create> | undefined,
  to: ReturnType<typeof Position.create> | undefined
): ReturnType<typeof Position.create> {
  return {
    x: ((from?.x ?? 0) + (to?.x ?? 0)) / 2,
    y: ((from?.y ?? 0) + (to?.y ?? 0)) / 2
  };
}

function distanceBetween(
  current: ReturnType<typeof Position.create>,
  target: ReturnType<typeof Position.create>
): number {
  return Math.hypot(target.x - current.x, target.y - current.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createRenderableDefinition(definition: RenderObjectDefinition): RenderObjectDefinition {
  const { id: _id, ...renderable } = definition;
  return definition.children
    ? {
        ...renderable,
        children: definition.children.map((child) => ({ ...child }))
      }
    : renderable;
}

function createPresentationData(
  definition: RenderObjectDefinition,
  nodeAnimations: SandboxRenderRigDefinition["nodeAnimations"] | undefined
) {
  return nodeAnimations ? { definition, nodeAnimations } : { definition };
}
