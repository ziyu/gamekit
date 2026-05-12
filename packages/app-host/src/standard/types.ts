import type { AssetManager } from "@gamekit/asset";
import type { CameraController, CameraState2D } from "@gamekit/camera-core";
import type { GameModule } from "@gamekit/core";
import type { DataKindDefinition, DataPack, DataRegistry } from "@gamekit/data";
import type { GameInstallContext, GameRuntime } from "@gamekit/game-runtime";
import type { InputRouter, InputSourceAdapter } from "@gamekit/input-core";
import type { PlatformRuntime } from "@gamekit/platform-core";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
import type { TcaDefinitionSet, TcaTraceStore, TcaRuntime } from "@gamekit/tca";
import type {
  AppAdapterRegistry,
  AppServiceFactory,
  AppServiceFactoryContext
} from "../definition/types";
import type { AppConfigSource } from "../runtime/types";

export type StandardAppServiceState = {
  platform?: PlatformRuntime;
  data?: DataRegistry;
  assets?: AssetManager;
  renderer?: RendererAdapter;
  input?: InputRouter;
  game?: GameRuntime;
};

export type StandardServiceBuildContext<TContext> = Omit<
  AppServiceFactoryContext<TContext>,
  "services"
> & {
  adapters: AppAdapterRegistry;
  serviceDefinitions: AppServiceFactoryContext<TContext>["services"];
  state: StandardAppServiceState;
};

export type CreateStandardAppProfileOptions<TContext> = {
  id: string;
  configSources?: AppConfigSource[] | undefined;
  adapters?: AppAdapterRegistry | undefined;
  services?: StandardAppProfileOptions<TContext> | undefined;
  extensions?: Record<string, AppServiceFactory<TContext>> | undefined;
  expose?(ctx: StandardServiceBuildContext<TContext>): void;
};

export type StandardAppProfileOptions<TContext> = {
  platform?: StandardPlatformOptions<TContext> | undefined;
  data?: StandardDataOptions<TContext> | undefined;
  renderer?: StandardRendererOptions<TContext> | undefined;
  assets?: StandardAssetOptions<TContext> | undefined;
  input?: StandardInputOptions<TContext> | undefined;
  game?: StandardGameOptions<TContext> | undefined;
};

export type StandardValue<TValue, TContext> =
  | TValue
  | ((ctx: StandardServiceBuildContext<TContext>) => TValue);

export type StandardAdapterRef<TValue> = string | TValue;

export type StandardPlatformOptions<_TContext> = {
  adapter: StandardAdapterRef<PlatformRuntime>;
};

export type StandardDataOptions<TContext> = {
  registry: StandardValue<DataRegistry, TContext>;
  kinds?(ctx: StandardServiceBuildContext<TContext>): DataKindDefinition[];
  dataPacks?(ctx: StandardServiceBuildContext<TContext>): DataPack[];
};

export type StandardRendererOptions<TContext> = {
  adapter: StandardAdapterRef<RendererAdapter>;
  boot?(ctx: StandardServiceBuildContext<TContext>): RendererBootContext | undefined;
};

export type StandardAssetOptions<TContext> = {
  manager: StandardValue<AssetManager, TContext>;
  dataRegistry?(ctx: StandardServiceBuildContext<TContext>): DataRegistry | undefined;
  preloadGroups?(ctx: StandardServiceBuildContext<TContext>): string[] | undefined;
};

export type StandardInputOptions<TContext> = {
  router: StandardValue<InputRouter, TContext>;
  configure?(ctx: StandardServiceBuildContext<TContext>, router: InputRouter): void;
  adapters?(ctx: StandardServiceBuildContext<TContext>, router: InputRouter): InputSourceAdapter[];
};

export type StandardGameOptions<TContext> = {
  runtime?: StandardValue<GameRuntime, TContext> | undefined;
  createRuntime?(
    ctx: StandardServiceBuildContext<TContext>,
    modules: Array<GameModule<GameInstallContext>>
  ): GameRuntime;
  modules?: StandardValue<Array<GameModule<GameInstallContext>>, TContext> | undefined;
  standardModules?: StandardGameModuleOptions<TContext> | undefined;
};

export type StandardGameModuleOptions<TContext> = {
  camera?: StandardCameraGameModuleOptions<TContext> | undefined;
  tca?: StandardTcaGameModuleOptions<TContext> | undefined;
};

export type StandardCameraGameModuleOptions<TContext> = {
  id?: string | undefined;
  controller: StandardValue<CameraController, TContext>;
  inputEventType?: string | undefined;
  actions?: StandardValue<StandardCameraActionBinding[], TContext> | undefined;
  smoothing?: StandardValue<StandardCameraSmoothingOptions, TContext> | undefined;
  sync?(
    ctx: StandardServiceBuildContext<TContext>,
    controller: CameraController,
    action: StandardCameraActionBinding | undefined,
    state: CameraState2D
  ): void;
};

export type StandardCameraActionBinding = {
  actionId: string;
  phases?: string[] | undefined;
  pan?: { x?: number | undefined; y?: number | undefined } | undefined;
  zoom?:
    | {
        delta?: number | undefined;
        wheel?: boolean | undefined;
        anchorFromInput?: boolean | undefined;
      }
    | undefined;
};

export type StandardCameraSmoothingOptions = {
  enabled?: boolean | undefined;
  stiffness?: number | undefined;
  positionEpsilon?: number | undefined;
  zoomEpsilon?: number | undefined;
  rotationEpsilon?: number | undefined;
};

export type StandardTcaGameModuleOptions<TContext> = {
  id?: string | undefined;
  dataRegistry?: ((ctx: StandardServiceBuildContext<TContext>) => DataRegistry) | undefined;
  ruleKind?: string | undefined;
  definitions?: StandardValue<TcaDefinitionSet, TContext> | undefined;
  traceStore?: StandardValue<TcaTraceStore, TContext> | undefined;
  onRuntime?(ctx: StandardServiceBuildContext<TContext>, runtime: TcaRuntime): void;
};
