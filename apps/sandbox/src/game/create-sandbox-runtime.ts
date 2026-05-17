import { createEventBus, type GameEvent } from "@gamekit/event-bus";
import {
  createGasModule,
  createGasTcaDefinitions,
  createGasTraceStore,
  type GasRuntime,
  type GasTraceStore
} from "@gamekit/gas";
import { createGame, type GameInstallContext } from "@gamekit/game-runtime";
import type { GameModule } from "@gamekit/core";
import type { RendererAdapter } from "@gamekit/renderer-core";
import {
  createTcaModule,
  createTcaTraceStore,
  mergeTcaDefinitionSets,
  type TcaTraceStore
} from "@gamekit/tca";
import { createKootaWorld } from "@gamekit/world-koota";
import type { DataRegistry } from "@gamekit/data";
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
} from "./components";
import {
  createSandboxDataRegistry,
  getSandboxObjectivePhase,
  getSandboxRenderObject,
  getSandboxRenderRig,
  getSandboxSceneObjects,
  getSandboxSignalOutpostLayout,
  getSandboxStationDefinition
} from "./sandbox-data";
import { createSandboxRenderSyncModule } from "./modules/sandbox-render-sync-module";
import { createSandboxOutpostModule } from "./modules/sandbox-outpost-module";
import { createSandboxTcaDefinitions } from "./modules/sandbox-tca-definitions";
import type {
  SandboxContentSummary,
  SandboxEntitySnapshot,
  SandboxModuleSummary,
  SandboxObjectiveSnapshot,
  SandboxRuntime,
  SandboxSnapshotOptions,
  SandboxTimelineEntry
} from "./types";

export const SANDBOX_RENDER_SIZE = {
  width: 720,
  height: 524
} as const;

export type CreateSandboxRuntimeOptions = {
  seed?: string;
  renderer?: RendererAdapter;
  dataRegistry?: DataRegistry;
  modules?: Array<GameModule<GameInstallContext>>;
  tcaTraceStore?: TcaTraceStore;
  gasTraceStore?: GasTraceStore;
  gasRuntime?: (() => GasRuntime | undefined) | undefined;
  onGasRuntime?: ((runtime: GasRuntime) => void) | undefined;
  assetSummary?: (() => Pick<SandboxContentSummary, "assetsLoaded" | "assetsFailed">) | undefined;
  renderSize?: {
    width: number;
    height: number;
  };
};

export function createSandboxRuntime(
  seedOrOptions: string | CreateSandboxRuntimeOptions = "hero-road-dev-seed"
): SandboxRuntime {
  const options = typeof seedOrOptions === "string" ? { seed: seedOrOptions } : seedOrOptions;
  const world = createKootaWorld();
  const eventBus = createEventBus({ clock: () => Math.round(performance.now()) });
  const events: GameEvent[] = [];
  const dataRegistry = options.dataRegistry ?? createSandboxDataRegistry();
  const tcaTraceStore = options.tcaTraceStore ?? createTcaTraceStore({ limit: 20 });
  const gasTraceStore = options.gasTraceStore ?? createGasTraceStore({ limit: 30 });
  let gasRuntime: GasRuntime | undefined;
  const readGasRuntime = options.gasRuntime ?? (() => gasRuntime);
  const outpostLayout = getSandboxSignalOutpostLayout(dataRegistry);
  const modules = [
    ...(options.modules ?? [
      createGasModule({
        id: "sandbox.gas",
        dataRegistry,
        traceStore: gasTraceStore,
        onRuntime(runtime) {
          gasRuntime = runtime;
          options.onGasRuntime?.(runtime);
        }
      }),
      createTcaModule({
        id: "sandbox.tca",
        dataRegistry,
        traceStore: tcaTraceStore,
        definitions: mergeTcaDefinitionSets(
          createSandboxTcaDefinitions(),
          createGasTcaDefinitions({ runtime: () => gasRuntime })
        )
      })
    ]),
    createSandboxOutpostModule({
      layout: outpostLayout,
      sceneObjects: getSandboxSceneObjects(dataRegistry, outpostLayout),
      renderObject: (id) => getSandboxRenderObject(dataRegistry, id),
      renderRig: (id) => getSandboxRenderRig(dataRegistry, id),
      stationDefinition: (id) => getSandboxStationDefinition(dataRegistry, id),
      objectivePhase: (id) => getSandboxObjectivePhase(dataRegistry, id),
      gasRuntime: readGasRuntime
    })
  ];

  if (options.renderer) {
    modules.push(
      createSandboxRenderSyncModule({
        renderer: options.renderer,
        size: options.renderSize ?? SANDBOX_RENDER_SIZE
      })
    );
  }

  eventBus.onAny((event) => {
    events.push(event);
    if (events.length > 80) {
      events.shift();
    }
  });

  const runtime = createGame({
    modules,
    world,
    eventBus,
    seed: options.seed ?? "hero-road-dev-seed"
  });

  return {
    runtime,
    events,
    tcaTraceStore,
    gasTraceStore,
    snapshot(snapshotOptions?: SandboxSnapshotOptions) {
      const gasActors = readGasRuntime()?.snapshot().actors ?? [];
      const actorIdByEntity = new Map(
        gasActors
          .filter((actor) => actor.actor.entityId !== undefined)
          .map((actor) => [actor.actor.entityId!, actor.actor.actorId])
      );
      const entities: SandboxEntitySnapshot[] = world
        .query([Position, SceneObject])
        .map((entity) => {
          const position = world.get(entity, Position);
          const velocity = world.get(entity, Velocity);
          const presentation = world.get(entity, RenderObjectPresentation);
          const sceneObject = world.get(entity, SceneObject);
          const storage = world.get(entity, SignalStorage);
          const station = world.get(entity, StationState);
          const production = world.get(entity, ProductionState);
          const work = world.get(entity, WorkAssignment);
          const threat = world.get(entity, ThreatState);
          const objective = world.get(entity, ObjectiveState);
          const link = world.get(entity, LinkState);
          const selectable = world.get(entity, Selectable);

          return {
            id: entity,
            objectId: sceneObject?.objectId,
            label: sceneObject?.label,
            role: sceneObject?.role,
            actorId: actorIdByEntity.get(entity),
            renderObjectId: presentation?.renderObjectId,
            x: position?.x ?? 0,
            y: position?.y ?? 0,
            vx: velocity?.x ?? 0,
            vy: velocity?.y ?? 0,
            signal: storage?.signal,
            fragments: storage?.fragments,
            capacity: storage?.capacity,
            station: station
              ? {
                  stationId: station.stationId,
                  zone: station.zone,
                  priority: station.priority,
                  stability: station.stability,
                  heat: station.heat,
                  throughput: station.throughput,
                  mode: station.mode
                }
              : undefined,
            productionRate: production?.ratePerSecond,
            recipeId: production?.recipeId,
            task: work?.task,
            taskStatus: work?.status,
            sourceObjectId: work?.sourceObjectId,
            targetObjectId: work?.targetObjectId,
            cargo: work?.cargo,
            battery: work?.battery,
            fatigue: work?.fatigue,
            routeProgress: work?.routeProgress,
            threatIntensity: threat?.intensity,
            objective: objective
              ? {
                  objectiveId: objective.objectiveId,
                  phaseId: objective.phaseId,
                  progressSignal: objective.progressSignal,
                  targetSignal: objective.targetSignal,
                  unlocked: objective.unlocked
                }
              : undefined,
            link: link
              ? {
                  fromObjectId: link.fromObjectId,
                  toObjectId: link.toObjectId,
                  flow: link.flow,
                  status: link.status
                }
              : undefined,
            selected: selectable?.selected
          };
        });

      const selectedEntity = snapshotOptions?.selectedEntityId
        ? entities.find((entity) => entity.id === snapshotOptions.selectedEntityId)
        : undefined;
      const useDefaultSelection = snapshotOptions?.defaultSelection !== false;
      const selectedActorId =
        snapshotOptions?.selectedActorId ??
        (useDefaultSelection && snapshotOptions?.selectedEntityId === undefined
          ? (selectedEntity?.actorId ?? gasActors[0]?.actor.actorId)
          : selectedEntity?.actorId);
      const selectedActor = gasActors.find((actor) => actor.actor.actorId === selectedActorId);
      const contentSummary = createContentSummary(dataRegistry, options.assetSummary?.());

      return {
        running: runtime.isRunning(),
        clock: runtime.clock.snapshot(),
        entityCount: world.count(),
        entities,
        selected:
          selectedActorId === undefined && selectedEntity === undefined
            ? undefined
            : {
                actorId: selectedActorId,
                entityId: selectedEntity?.id ?? selectedActor?.actor.entityId
              },
        objective: createObjectiveSnapshot(entities),
        timeline: createTimeline({
          events,
          tcaTraces: tcaTraceStore.list(),
          gasTraces: gasTraceStore.list()
        }),
        moduleSummary: createModuleSummary(runtime, world.count(), gasActors.length),
        contentSummary,
        events: [...events],
        tcaRuleCount: dataRegistry.list("tca.rule").length,
        tcaTraces: tcaTraceStore.list(),
        gasActors,
        gasTraces: gasTraceStore.list()
      };
    }
  };
}

function createObjectiveSnapshot(entities: SandboxEntitySnapshot[]): SandboxObjectiveSnapshot {
  const core = entities.find((entity) => entity.role === "command-core");
  const relays = entities.filter((entity) => entity.role === "relay-tower");
  const threat = entities.find((entity) => entity.role === "interference-node");
  const objective = core?.objective;
  const averageStability =
    relays.length === 0
      ? 100
      : relays.reduce((total, relay) => total + (relay.station?.stability ?? 100), 0) /
        relays.length;
  const signalProgress = Math.min(
    1,
    Math.max(0, (objective?.progressSignal ?? core?.signal ?? 0) / (objective?.targetSignal ?? 220))
  );
  const relayProgress =
    relays.length === 0
      ? 0
      : relays.reduce((total, relay) => {
          const capacity = relay.capacity ?? 1;
          return total + Math.min(1, (relay.signal ?? 0) / capacity);
        }, 0) / relays.length;
  const progress = Math.round(
    (signalProgress * 0.72 + relayProgress * 0.18 + (averageStability / 100) * 0.1) * 100
  );

  return {
    id: "signal-outpost",
    label:
      objective?.phaseId === "objective.sandbox.phase.bootstrap"
        ? "Signal Outpost / Bootstrap Uplink"
        : "Signal Outpost",
    status: progress >= 100 ? "complete" : progress > 0 ? "running" : "waiting",
    progress,
    detail:
      progress === 0
        ? "Signal relays are warming up. Focus the viewport and press confirm to overcharge."
        : `Phase ${objective?.phaseId.replace("objective.sandbox.phase.", "") ?? "bootstrap"} · objective signal ${Math.round(objective?.progressSignal ?? 0)} / ${Math.round(objective?.targetSignal ?? 220)} · relay charge ${Math.round(relayProgress * 100)}% · stability ${Math.round(averageStability)}% · threat ${Math.round((threat?.threatIntensity ?? 0) * 100)}%`
  };
}

function createTimeline(input: {
  events: GameEvent[];
  tcaTraces: ReturnType<TcaTraceStore["list"]>;
  gasTraces: ReturnType<GasTraceStore["list"]>;
}): SandboxTimelineEntry[] {
  return [
    ...input.events.map((event, index): SandboxTimelineEntry => {
      const payload = isRecord(event.payload) ? event.payload : {};
      return {
        id: `event-${index}-${event.type}-${event.timestamp}`,
        time: event.timestamp,
        kind: eventKind(event.type),
        label: event.type,
        source: event.source ?? "event-bus",
        actorId: readString(payload.actorId),
        entityId: readEntityId(payload.entity),
        status: readString(payload.phase)
      };
    }),
    ...input.tcaTraces.map(
      (trace): SandboxTimelineEntry => ({
        id: `tca-${trace.id}`,
        time: trace.timestamp,
        kind: "tca",
        label: trace.ruleId,
        source: trace.eventType,
        status: trace.status
      })
    ),
    ...input.gasTraces.map(
      (trace): SandboxTimelineEntry => ({
        id: `gas-${trace.id}`,
        time: trace.timestamp,
        kind: "gas",
        label: trace.type,
        source: trace.message ?? "gas",
        actorId: trace.actorId,
        status: trace.abilityId ?? trace.effectId
      })
    )
  ]
    .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id))
    .slice(-80);
}

function createModuleSummary(
  runtime: ReturnType<typeof createGame>,
  entityCount: number,
  actorCount: number
): SandboxModuleSummary[] {
  return [
    {
      id: "runtime",
      label: "Runtime",
      status: runtime.isRunning() ? "running" : "stopped",
      detail: `${runtime.systems.values().length} systems · ${runtime.modules.length} modules`
    },
    {
      id: "world",
      label: "World",
      status: `${entityCount} entities`,
      detail: "Koota adapter hidden behind GameWorld facade"
    },
    {
      id: "renderer",
      label: "Renderer",
      status: "phaser",
      detail: "RenderObject tree + node animation sync"
    },
    {
      id: "rules",
      label: "TCA / GAS",
      status: `${actorCount} actors`,
      detail: "Event rules activate abilities and effects"
    }
  ];
}

function createContentSummary(
  dataRegistry: DataRegistry,
  assets: Pick<SandboxContentSummary, "assetsLoaded" | "assetsFailed"> | undefined
): SandboxContentSummary {
  const snapshot = dataRegistry.snapshot();
  return {
    packs: snapshot.packs.length,
    types: snapshot.types.length,
    documents: snapshot.documents.length,
    references: snapshot.references.length,
    assetsLoaded: assets?.assetsLoaded ?? 0,
    assetsFailed: assets?.assetsFailed ?? 0
  };
}

function eventKind(type: string): SandboxTimelineEntry["kind"] {
  if (type === "input.action") {
    return "input";
  }
  if (type.startsWith("renderer.") || type.startsWith("sandbox.render")) {
    return "renderer";
  }
  if (type.startsWith("runtime.")) {
    return "runtime";
  }
  return "event";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readEntityId(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
