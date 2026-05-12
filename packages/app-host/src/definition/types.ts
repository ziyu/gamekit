import type { AppConfigSource, AppHost, AppServiceBinding, AppServiceId } from "../runtime/types";
import type { StandardAppProfileOptions } from "../standard/types";

export type GameAppDefinition<TServiceConfig = unknown> = {
  id: string;
  configSources?: AppConfigSource[] | undefined;
  services: Array<GameAppServiceDefinition<TServiceConfig>>;
  metadata?: Record<string, unknown> | undefined;
};

export type GameAppServiceDefinition<TConfig = unknown> = {
  id: AppServiceId;
  config?: TConfig | undefined;
  dependencies?: AppServiceId[] | undefined;
  enabled?: boolean | undefined;
};

export type AppProfile<TContext = unknown> = {
  id: string;
  configSources?: AppConfigSource[] | undefined;
  adapters?: AppAdapterRegistry | undefined;
  standard?: StandardAppProfileOptions<TContext> | undefined;
  exposeStandard?:
    | ((ctx: import("../standard/types").StandardServiceBuildContext<TContext>) => void)
    | undefined;
  extensions?: AppServiceFactoryRegistry<TContext> | undefined;
};

export type AppAdapterRegistry = Record<string, unknown>;

export type AppServiceFactoryRegistry<TContext = unknown> = Record<
  string,
  AppServiceFactory<TContext>
>;

export type AppServiceFactory<TContext = unknown> = (
  ctx: AppServiceFactoryContext<TContext>
) => AppServiceBinding | AppServiceBinding[];

export type AppServiceFactoryContext<TContext = unknown> = {
  app: GameAppDefinition;
  profile: AppProfile<TContext>;
  service: GameAppServiceDefinition;
  services: Array<GameAppServiceDefinition>;
  context: TContext;
  resolveConfig<TConfig = unknown>(): TConfig | undefined;
  requireConfig<TConfig = unknown>(): TConfig;
};

export type CreateConfiguredAppHostOptions<TContext = unknown> = {
  app: GameAppDefinition;
  profile: AppProfile<TContext>;
  context: TContext;
  configSources?: AppConfigSource[] | undefined;
  clock?: (() => number) | undefined;
};

export type ConfiguredAppHost<TContext = unknown> = {
  app: GameAppDefinition;
  profile: AppProfile<TContext>;
  context: TContext;
  host: AppHost;
};
