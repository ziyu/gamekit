import type { AssetDiagnosticEvent, AssetLoaderAdapter, AssetManager } from "@gamekit/asset";
import type { CameraController, CameraState2D, PointLike } from "@gamekit/camera-core";
import type { GameModule } from "@gamekit/core";
import type { DataPack, DataRegistry, DataTypeDefinition } from "@gamekit/data";
import type { DriverBootContext, DriverRegistry, GameDriver } from "@gamekit/driver-core";
import type { GasRuntime, GasTraceStore } from "@gamekit/gas";
import type { GameInstallContext, GameRuntime } from "@gamekit/game-runtime";
import type { InputDevice, InputRouter, InputSourceAdapter } from "@gamekit/input-core";
import type { PlatformRuntime } from "@gamekit/platform-core";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
import type {
  SaveCodec,
  SaveCompatibilityMetadata,
  SaveContributor,
  SaveContributorPolicy,
  SaveManager,
  SaveMigrationRegistry,
  SaveStore,
  SaveVersion
} from "@gamekit/save";
import type { TcaDefinitionSet, TcaTraceStore, TcaRuntime } from "@gamekit/tca";
import type { UiRuntime } from "@gamekit/ui-core";
import type {
  AppAdapterRegistry,
  AppServiceFactory,
  AppServiceFactoryContext
} from "../definition/types";
import type { AppConfigSource, AppStandardServiceId } from "../runtime/types";

export type StandardAppServiceState = {
  platform?: PlatformRuntime;
  drivers?: DriverRegistry;
  data?: DataRegistry;
  assets?: AssetManager;
  renderer?: RendererAdapter;
  input?: InputRouter;
  game?: GameRuntime;
  ui?: UiRuntime;
  save?: SaveManager;
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
  drivers?: StandardDriverOptions<TContext> | undefined;
  data?: StandardDataOptions<TContext> | undefined;
  renderer?: StandardRendererOptions<TContext> | undefined;
  assets?: StandardAssetOptions<TContext> | undefined;
  input?: StandardInputOptions<TContext> | undefined;
  game?: StandardGameOptions<TContext> | undefined;
  ui?: StandardUiOptions<TContext> | undefined;
  save?: StandardSaveOptions<TContext> | undefined;
};

export type StandardValue<TValue, TContext> =
  | TValue
  | ((ctx: StandardServiceBuildContext<TContext>) => TValue);

export type StandardAdapterRef<TValue> = string | TValue;

export type StandardPlatformOptions<_TContext> = {
  adapter: StandardAdapterRef<PlatformRuntime>;
};

export type StandardDriverOptions<TContext> = {
  registry?: StandardValue<DriverRegistry, TContext> | undefined;
  drivers: StandardValue<GameDriver[], TContext>;
  boot?(ctx: StandardServiceBuildContext<TContext>, driver: GameDriver): DriverBootContext;
};

export type StandardDataOptions<TContext> = {
  registry: StandardValue<DataRegistry, TContext>;
  types?(ctx: StandardServiceBuildContext<TContext>): DataTypeDefinition[];
  dataPacks?(ctx: StandardServiceBuildContext<TContext>): DataPack[];
};

export type StandardRendererOptions<TContext> = {
  adapter?: StandardAdapterRef<RendererAdapter> | undefined;
  driver?: string | undefined;
  boot?(ctx: StandardServiceBuildContext<TContext>): RendererBootContext | undefined;
};

export type StandardAssetOptions<TContext> = {
  manager?: StandardValue<AssetManager, TContext> | undefined;
  adapter?: StandardValue<AssetLoaderAdapter, TContext> | undefined;
  driver?: string | undefined;
  onDiagnostic?(event: AssetDiagnosticEvent): void;
  dataRegistry?(ctx: StandardServiceBuildContext<TContext>): DataRegistry | undefined;
  preloadGroups?(ctx: StandardServiceBuildContext<TContext>): string[] | undefined;
};

export type StandardInputOptions<TContext> = {
  router: StandardValue<InputRouter, TContext>;
  configure?(ctx: StandardServiceBuildContext<TContext>, router: InputRouter): void;
  adapters?(ctx: StandardServiceBuildContext<TContext>, router: InputRouter): InputSourceAdapter[];
  driverSources?: StandardInputDriverSourceOptions[] | undefined;
};

export type StandardInputDriverSourceOptions = {
  driver?: string | undefined;
  source?: string | undefined;
  scope?: string | undefined;
  devices?: InputDevice[] | undefined;
};

export type StandardUiOptions<TContext> = {
  runtime: StandardValue<UiRuntime, TContext>;
  style?: unknown;
  panels?(ctx: StandardServiceBuildContext<TContext>): Array<{
    id: string;
    title: string;
    kind: "panel" | "window" | "modal" | "overlay" | "hud" | "devtools";
    tags?: string[];
  }>;
  openPanels?(ctx: StandardServiceBuildContext<TContext>): string[] | undefined;
};

export type StandardSaveOptions<TContext> = {
  manager?: StandardValue<SaveManager, TContext> | undefined;
  store?: StandardValue<SaveStore, TContext> | undefined;
  codec?: StandardValue<SaveCodec, TContext> | undefined;
  migrations?: StandardValue<SaveMigrationRegistry, TContext> | undefined;
  serviceContext?: StandardValue<StandardSaveServiceContextOptions, TContext> | undefined;
  contributorPolicy?: StandardValue<SaveContributorPolicy, TContext> | undefined;
  contributors?(
    ctx: StandardServiceBuildContext<TContext>,
    manager: SaveManager
  ): SaveContributor[];
  appId?: StandardValue<string, TContext> | undefined;
  gameId?: StandardValue<string, TContext> | undefined;
  gameVersion?: StandardValue<string, TContext> | undefined;
  formatVersion: StandardValue<SaveVersion, TContext>;
  compatibility?: StandardValue<SaveCompatibilityMetadata, TContext> | undefined;
};

export type StandardSaveServiceContextKey = Exclude<AppStandardServiceId, "save">;

export type StandardSaveServiceContextOptions = {
  include?: StandardSaveServiceContextKey[] | undefined;
  exclude?: StandardSaveServiceContextKey[] | undefined;
  extra?: Record<string, unknown> | undefined;
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
  gas?: StandardGasGameModuleOptions<TContext> | undefined;
};

export type StandardCameraGameModuleOptions<TContext> = {
  id?: string | undefined;
  controller: StandardValue<CameraController, TContext>;
  inputEventType?: string | undefined;
  actions?: StandardValue<StandardCameraActionBinding[], TContext> | undefined;
  smoothing?: StandardValue<StandardCameraSmoothingOptions, TContext> | undefined;
  follow?: StandardValue<StandardCameraFollowOptions<TContext>, TContext> | undefined;
  sync?(
    ctx: StandardServiceBuildContext<TContext>,
    controller: CameraController,
    action: StandardCameraActionBinding | undefined,
    state: CameraState2D
  ): void;
  driver?: string | undefined;
  syncToDriver?: boolean | undefined;
};

export type StandardCameraFollowOptions<TContext> = {
  eventType?: string | undefined;
  stopEventType?: string | undefined;
  targetFromEvent?: ((event: { payload: unknown }) => string | number | undefined) | undefined;
  resolveTarget(
    ctx: StandardServiceBuildContext<TContext>,
    targetEntity: string | number
  ): PointLike | undefined;
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

export type StandardGasGameModuleOptions<TContext> = {
  id?: string | undefined;
  dataRegistry?: ((ctx: StandardServiceBuildContext<TContext>) => DataRegistry) | undefined;
  traceStore?: StandardValue<GasTraceStore, TContext> | undefined;
  onRuntime?(ctx: StandardServiceBuildContext<TContext>, runtime: GasRuntime): void;
};
