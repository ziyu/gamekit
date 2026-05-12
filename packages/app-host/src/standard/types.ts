import type { AssetManager } from "@gamekit/asset";
import type { CameraController } from "@gamekit/camera-core";
import type { DataKindDefinition, DataPack, DataRegistry } from "@gamekit/data";
import type { GameRuntime } from "@gamekit/game-runtime";
import type { InputRouter, InputSourceAdapter } from "@gamekit/input-core";
import type { PlatformRuntime } from "@gamekit/platform-core";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
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
  camera?: CameraController;
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
  camera?: StandardCameraOptions<TContext> | undefined;
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

export type StandardCameraOptions<TContext> = {
  controller: StandardValue<CameraController, TContext>;
  apply?(ctx: StandardServiceBuildContext<TContext>, controller: CameraController): void;
};

export type StandardInputOptions<TContext> = {
  router: StandardValue<InputRouter, TContext>;
  configure?(ctx: StandardServiceBuildContext<TContext>, router: InputRouter): void;
  adapters?(ctx: StandardServiceBuildContext<TContext>, router: InputRouter): InputSourceAdapter[];
};

export type StandardGameOptions<TContext> = {
  runtime?: StandardValue<GameRuntime, TContext> | undefined;
  createRuntime?(ctx: StandardServiceBuildContext<TContext>): GameRuntime;
};
