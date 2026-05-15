import type { AssetManager } from "@gamekit/asset";
import type { DataRegistry } from "@gamekit/data";
import type { GameRuntime } from "@gamekit/game-runtime";
import type { InputRouter } from "@gamekit/input-core";
import type { PlatformRuntime } from "@gamekit/platform-core";
import type { RendererAdapter } from "@gamekit/renderer-core";
import type { UiRuntime } from "@gamekit/ui-core";

export type AppLifecyclePhase =
  | "registered"
  | "booting"
  | "booted"
  | "starting"
  | "started"
  | "stopping"
  | "stopped"
  | "disposing"
  | "disposed"
  | "failed";

export type AppLifecycleStage = "boot" | "start" | "stop" | "dispose";

export type AppServiceId = string;

export type AppServiceKey<TService> = {
  id: AppServiceId;
  optional?: boolean;
  description?: string;
  _service?: TService;
};

export type AppServiceDescriptor = {
  id: AppServiceId;
  description?: string;
  phase: AppLifecyclePhase;
  dependencies: AppServiceId[];
  standard?: AppStandardServiceId;
};

export type AppServiceSnapshot = AppServiceDescriptor & {
  snapshot?: unknown;
};

export type AppDiagnosticSeverity = "info" | "warning" | "error";

export type AppDiagnosticEvent = {
  type: string;
  severity: AppDiagnosticSeverity;
  timestamp: number;
  source?: string;
  payload: Record<string, unknown>;
};

export type AppDiagnostics = {
  emit(event: Omit<AppDiagnosticEvent, "timestamp"> & { timestamp?: number }): void;
  list(): AppDiagnosticEvent[];
  clear(): void;
};

export type AppConfigSource = {
  id: string;
  priority: number;
  values: Record<string, unknown>;
};

export type AppConfigEntry = {
  path: string;
  value: unknown;
  source: string;
};

export type AppConfigSnapshot = {
  sources: Array<{ id: string; priority: number }>;
  entries: AppConfigEntry[];
};

export type AppConfigRuntime = {
  get<T = unknown>(path: string): T | undefined;
  require<T = unknown>(path: string): T;
  setOverride(path: string, value: unknown, source: string): void;
  snapshot(): AppConfigSnapshot;
};

export type AppHostContext = {
  host: AppHost;
  services: AppServiceRegistry;
  config: AppConfigRuntime;
  diagnostics: AppDiagnostics;
};

export type AppServiceLifecycle = {
  id: AppServiceId;
  dependencies?: AppServiceId[] | undefined;
  boot?(ctx: AppHostContext): Promise<void> | void;
  start?(ctx: AppHostContext): Promise<void> | void;
  stop?(ctx: AppHostContext): Promise<void> | void;
  dispose?(ctx: AppHostContext): Promise<void> | void;
  snapshot?(): unknown;
};

export type AppServiceBinding<TService = unknown> = {
  key: AppServiceKey<TService>;
  service: TService;
  lifecycle: AppServiceLifecycle;
  standard?: AppStandardServiceId | undefined;
};

export type AppServiceRegistry = {
  platform?: PlatformRuntime;
  data?: DataRegistry;
  assets?: AssetManager;
  renderer?: RendererAdapter;
  input?: InputRouter;
  game?: GameRuntime;
  ui?: UiRuntime;
  has<TService>(key: AppServiceKey<TService>): boolean;
  get<TService>(key: AppServiceKey<TService>): TService | undefined;
  require<TService>(key: AppServiceKey<TService>): TService;
  register<TService>(binding: AppServiceBinding<TService>): void;
  unregister<TService>(key: AppServiceKey<TService>): void;
  binding<TService>(key: AppServiceKey<TService>): AppServiceBinding<TService> | undefined;
  bindings(): Array<AppServiceBinding>;
  descriptors(): AppServiceDescriptor[];
  setPhase(serviceId: AppServiceId, phase: AppLifecyclePhase): void;
};

export type AppHostSnapshot = {
  id: string;
  phase: AppLifecyclePhase;
  services: AppServiceSnapshot[];
  config: AppConfigSnapshot;
  diagnostics: AppDiagnosticEvent[];
};

export type AppHost = {
  id: string;
  services: AppServiceRegistry;
  config: AppConfigRuntime;
  diagnostics: AppDiagnostics;
  boot(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  snapshot(): AppHostSnapshot;
};

export type AppStandardServiceId =
  | "platform"
  | "data"
  | "assets"
  | "renderer"
  | "input"
  | "game"
  | "ui";

export type CreateAppHostOptions = {
  id: string;
  configSources?: AppConfigSource[] | undefined;
  services?: Array<AppServiceBinding> | undefined;
  clock?: (() => number) | undefined;
};
