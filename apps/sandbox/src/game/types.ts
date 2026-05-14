import type { GameEvent } from "@gamekit/event-bus";
import type { GasActorRuntimeState, GasTraceEntry, GasTraceStore } from "@gamekit/gas";
import type { GameRuntime } from "@gamekit/game-runtime";
import type { TcaTraceEntry, TcaTraceStore } from "@gamekit/tca";
import type { EntityId } from "@gamekit/world";
import type { SandboxSceneRole } from "./components";

export type SandboxEntitySnapshot = {
  id: EntityId;
  objectId?: string | undefined;
  label?: string | undefined;
  role?: SandboxSceneRole | undefined;
  actorId?: string | undefined;
  renderObjectId?: string | undefined;
  x: number;
  y: number;
  vx: number;
  vy: number;
  signal?: number | undefined;
  fragments?: number | undefined;
  capacity?: number | undefined;
  station?:
    | {
        stationId: string;
        zone: string;
        priority: number;
        stability: number;
        heat: number;
        throughput: number;
        mode: string;
      }
    | undefined;
  productionRate?: number | undefined;
  recipeId?: string | undefined;
  task?: string | undefined;
  taskStatus?: string | undefined;
  sourceObjectId?: string | undefined;
  targetObjectId?: string | undefined;
  cargo?: number | undefined;
  battery?: number | undefined;
  fatigue?: number | undefined;
  routeProgress?: number | undefined;
  threatIntensity?: number | undefined;
  objective?:
    | {
        objectiveId: string;
        phaseId: string;
        progressSignal: number;
        targetSignal: number;
        unlocked: string[];
      }
    | undefined;
  link?:
    | {
        fromObjectId: string;
        toObjectId: string;
        flow: number;
        status: string;
      }
    | undefined;
  selected?: boolean | undefined;
};

export type SandboxObjectiveSnapshot = {
  id: string;
  label: string;
  status: "waiting" | "running" | "complete";
  progress: number;
  detail: string;
};

export type SandboxTimelineEntry = {
  id: string;
  time: number;
  kind: "input" | "event" | "tca" | "gas" | "renderer" | "runtime";
  label: string;
  source: string;
  actorId?: string | undefined;
  entityId?: EntityId | undefined;
  status?: string | undefined;
};

export type SandboxModuleSummary = {
  id: string;
  label: string;
  status: string;
  detail: string;
};

export type SandboxContentSummary = {
  packs: number;
  kinds: number;
  documents: number;
  references: number;
  assetsLoaded: number;
  assetsFailed: number;
};

export type SandboxSnapshotOptions = {
  selectedActorId?: string | undefined;
  selectedEntityId?: EntityId | undefined;
};

export type SandboxSnapshot = {
  running: boolean;
  clock: ReturnType<GameRuntime["clock"]["snapshot"]>;
  entityCount: number;
  entities: SandboxEntitySnapshot[];
  selected?: { actorId?: string | undefined; entityId?: EntityId | undefined } | undefined;
  objective: SandboxObjectiveSnapshot;
  timeline: SandboxTimelineEntry[];
  moduleSummary: SandboxModuleSummary[];
  contentSummary: SandboxContentSummary;
  events: GameEvent[];
  tcaRuleCount: number;
  tcaTraces: TcaTraceEntry[];
  gasActors: GasActorRuntimeState[];
  gasTraces: GasTraceEntry[];
};

export type SandboxRuntime = {
  runtime: GameRuntime;
  events: GameEvent[];
  tcaTraceStore: TcaTraceStore;
  gasTraceStore: GasTraceStore;
  snapshot(options?: SandboxSnapshotOptions): SandboxSnapshot;
};
