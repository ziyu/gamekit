import type { AssetManager } from "@gamekit/asset";
import type { AppHost } from "@gamekit/app-host";
import type { DataRegistry } from "@gamekit/data";
import type { SandboxRuntime } from "../game";

export type SandboxInspectorTab = "actor" | "runtime" | "content" | "rules" | "host";

export type SandboxTimelineFilter =
  | "all"
  | "input"
  | "event"
  | "tca"
  | "gas"
  | "renderer"
  | "runtime";

export type SandboxWorkbenchState = {
  selectedActorId?: string | undefined;
  selectedEntityId?: string | number | undefined;
  followedEntityId?: string | number | undefined;
  activeInspectorTab: SandboxInspectorTab;
  timelineFilter: SandboxTimelineFilter;
};

export type SandboxUiHandles = {
  root: HTMLElement;
  rendererRoot: HTMLDivElement;
  status: HTMLDivElement;
  objectiveLabel: HTMLElement;
  objectiveStatus: HTMLElement;
  objectiveProgress: HTMLElement;
  objectiveProgressBar: HTMLElement;
  objectiveDetail: HTMLElement;
  entityCount: HTMLElement;
  tick: HTMLElement;
  modules: HTMLElement;
  systems: HTMLElement;
  inputAction: HTMLElement;
  inputContext: HTMLElement;
  cameraPosition: HTMLElement;
  cameraZoom: HTMLElement;
  cameraMode: HTMLElement;
  selectedActor: HTMLElement;
  inspectorTabs: HTMLButtonElement[];
  inspectorBody: HTMLElement;
  timelineFilters: HTMLButtonElement[];
  timelineList: HTMLElement;
  latestHost?: AppHost | undefined;
  latestDataRegistry?: DataRegistry | undefined;
  latestAssetManager?: AssetManager | undefined;
  latestSandbox?: SandboxRuntime | undefined;
  lastWorkbenchRenderAt?: number | undefined;
};

export type SandboxCameraStatus = {
  x: number;
  y: number;
  zoom: number;
  mode: string;
};

export type SandboxInputStatus = {
  action: string;
  context: string;
};

export type SandboxPlatformStatus = {
  id: string;
  storage: string;
  fs: string;
};
