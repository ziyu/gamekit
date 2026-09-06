import { createAppHostError } from "../runtime/errors";
import type { AppProfile, AppServiceFactory } from "../definition/types";
import { createAssetManager } from "@gamekit/asset";
import { createDevToolsRuntime, type DevToolsRuntime } from "@gamekit/devtools";
import { createDriverRegistry } from "@gamekit/driver-core";
import { createSaveManager } from "@gamekit/save";
import type { AppServiceBinding } from "../runtime/types";
import {
  ASSET_SERVICE,
  DATA_SERVICE,
  DEVTOOLS_SERVICE,
  DRIVER_SERVICE,
  GAME_SERVICE,
  INPUT_SERVICE,
  PLATFORM_SERVICE,
  RENDERER_SERVICE,
  SAVE_SERVICE,
  UI_SERVICE
} from "../runtime/standard-keys";
import { createStandardContext, exposeStandardState } from "./context";
import {
  createStandardDevToolsDataSources,
  createStandardGameRuntimeProfiler,
  createStandardDevToolsPanels,
  normalizeStandardDevToolsOptions,
  registerStandardDevToolsUiPanels
} from "./devtools";
import {
  resolveDriverAssetLoader,
  resolveDriverInputSourceFactory,
  resolveDriverRenderer
} from "./driver-adapters";
import { createStandardGameModules } from "./game-modules";
import { resolveStandardAdapter, resolveStandardValue } from "./resolve";
import type {
  StandardAppServiceState,
  StandardInputOptions,
  StandardSaveServiceContextKey,
  StandardSaveServiceContextOptions,
  StandardServiceBuildContext
} from "./types";
import type { InputRouter, InputSourceAdapter } from "@gamekit/input-core";

export function createStandardServiceFactory<TContext>(
  profile: AppProfile<TContext>,
  serviceId: string,
  stateByContext: Map<TContext, StandardAppServiceState>
): AppServiceFactory<TContext> | undefined {
  if (!profile.standard) {
    return undefined;
  }

  return standardServiceDefinitions[serviceId]?.(profile, stateByContext);
}

type StandardServiceFactoryCreator = <TContext>(
  profile: AppProfile<TContext>,
  stateByContext: Map<TContext, StandardAppServiceState>
) => AppServiceFactory<TContext> | undefined;

const standardServiceDefinitions: Record<string, StandardServiceFactoryCreator | undefined> = {
  platform<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.platform,
      (ctx, options) => {
        const platform = resolveStandardAdapter(ctx, options.adapter, "platform");
        ctx.state.platform = platform;
        return {
          key: PLATFORM_SERVICE,
          service: platform,
          standard: "platform",
          lifecycle: {
            id: PLATFORM_SERVICE.id,
            dependencies: ctx.service.dependencies,
            snapshot() {
              return {
                id: platform.id,
                services: platform.services.list(),
                capabilities: platform.capabilities.list()
              };
            }
          }
        };
      }
    );
  },
  drivers<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.drivers,
      (ctx, options) => {
        const registry = options.registry
          ? resolveStandardValue(ctx, options.registry)
          : createDriverRegistry();
        for (const driver of resolveStandardValue(ctx, options.drivers)) {
          if (!registry.has(driver.id)) {
            registry.register(driver);
          }
        }
        ctx.state.drivers = registry;

        return {
          key: DRIVER_SERVICE,
          service: registry,
          standard: "drivers",
          lifecycle: {
            id: DRIVER_SERVICE.id,
            dependencies: ctx.service.dependencies,
            async boot() {
              for (const driver of registry.list()) {
                const boot = options.boot?.(ctx, driver);
                if (boot) {
                  await driver.boot(boot);
                }
              }
            },
            async start() {
              for (const driver of registry.list()) {
                await driver.start?.();
              }
            },
            async stop() {
              const errors: unknown[] = [];
              for (const driver of [...registry.list()].reverse()) {
                try {
                  await driver.stop?.();
                } catch (error) {
                  errors.push(error);
                }
              }
              if (errors.length === 1) throw errors[0];
              if (errors.length > 1) throw new AggregateError(errors, "Drivers failed during stop");
            },
            async dispose() {
              const errors: unknown[] = [];
              for (const driver of [...registry.list()].reverse()) {
                try {
                  await driver.dispose();
                } catch (error) {
                  errors.push(error);
                }
              }
              if (errors.length === 1) throw errors[0];
              if (errors.length > 1)
                throw new AggregateError(errors, "Drivers failed during dispose");
            },
            snapshot() {
              return registry.snapshot();
            }
          }
        };
      }
    );
  },
  data<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.data,
      (ctx, options) => {
        const registry = resolveStandardValue(ctx, options.registry);
        ctx.state.data = registry;
        return {
          key: DATA_SERVICE,
          service: registry,
          standard: "data",
          lifecycle: {
            id: DATA_SERVICE.id,
            dependencies: ctx.service.dependencies,
            boot() {
              for (const type of options.types?.(ctx) ?? []) {
                if (!registry.hasType(type.type)) {
                  registry.registerType(type);
                }
              }
              for (const pack of options.dataPacks?.(ctx) ?? []) {
                registry.registerPack(pack);
              }
            },
            snapshot() {
              return registry.snapshot();
            }
          }
        };
      }
    );
  },
  renderer<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.renderer,
      (ctx, options) => {
        const ownsRenderer = options.adapter !== undefined;
        const renderer =
          options.adapter === undefined
            ? resolveDriverRenderer(ctx, options.driver)
            : resolveStandardAdapter(ctx, options.adapter, "renderer");
        ctx.state.renderer = renderer;
        return {
          key: RENDERER_SERVICE,
          service: renderer,
          standard: "renderer",
          lifecycle: {
            id: RENDERER_SERVICE.id,
            dependencies: ctx.service.dependencies,
            async boot() {
              const boot = options.boot?.(ctx);
              if (boot && ownsRenderer) {
                await renderer.boot(boot);
              }
            },
            dispose() {
              if (ownsRenderer) {
                renderer.destroy();
              }
            },
            snapshot() {
              return {
                id: renderer.id,
                capabilities: renderer.capabilities()
              };
            }
          }
        };
      }
    );
  },
  assets<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.assets,
      (ctx, options) => {
        const manager =
          options.manager === undefined
            ? createAssetManager({
                adapter:
                  (options.adapter === undefined
                    ? undefined
                    : resolveStandardValue(ctx, options.adapter)) ??
                  resolveDriverAssetLoader(ctx, options.driver),
                onDiagnostic: (event) => {
                  options.onDiagnostic?.(event);
                }
              })
            : resolveStandardValue(ctx, options.manager);
        ctx.state.assets = manager;
        return {
          key: ASSET_SERVICE,
          service: manager,
          standard: "assets",
          lifecycle: {
            id: ASSET_SERVICE.id,
            dependencies:
              ctx.service.dependencies ??
              ((options.dataRegistry?.(ctx) ?? ctx.state.data) ? ["data"] : []),
            async boot() {
              const dataRegistry = options.dataRegistry?.(ctx) ?? ctx.state.data;
              if (dataRegistry?.hasType("asset.definition")) {
                manager.registerFromDataRegistry(dataRegistry);
              }
              const preloadGroups =
                options.preloadGroups?.(ctx) ??
                ctx.resolveConfig<{ preloadGroups?: string[] }>()?.preloadGroups;
              for (const group of preloadGroups ?? []) {
                const states = await manager.loadGroup(group);
                const failed = states.filter((state) => state.status === "failed");
                if (failed.length > 0)
                  throw createAppHostError(
                    "app_host.asset_preload_failed",
                    `Asset preload failed for group: ${group}`,
                    { group, assets: failed }
                  );
              }
            },
            snapshot() {
              return {
                assets: manager.assets(),
                states: manager.states()
              };
            }
          }
        };
      }
    );
  },
  input<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.input,
      (ctx, options) => {
        const router = resolveStandardValue(ctx, options.router);
        ctx.state.input = router;
        options.configure?.(ctx, router);
        const adapters = [
          ...(options.adapters?.(ctx, router) ?? []),
          ...createDriverInputSources(ctx, options, router)
        ];
        return {
          key: INPUT_SERVICE,
          service: router,
          standard: "input",
          lifecycle: {
            id: INPUT_SERVICE.id,
            dependencies: ctx.service.dependencies,
            start() {
              for (const adapter of adapters) {
                adapter.start();
              }
            },
            stop() {
              const errors: unknown[] = [];
              try {
                router.cancelAll();
              } catch (error) {
                errors.push(error);
              }
              for (const adapter of [...adapters].reverse()) {
                try {
                  adapter.stop();
                } catch (error) {
                  errors.push(error);
                }
              }
              if (errors.length === 1) throw errors[0];
              if (errors.length > 1)
                throw new AggregateError(errors, "Input sources failed during stop");
            },
            tick(_ctx, frame) {
              router.tick({ delta: frame.delta, timestamp: frame.timestamp });
            },
            dispose() {
              const errors: unknown[] = [];
              try {
                router.cancelAll();
              } catch (error) {
                errors.push(error);
              }
              for (const adapter of [...adapters].reverse()) {
                try {
                  adapter.destroy();
                } catch (error) {
                  errors.push(error);
                }
              }
              if (errors.length === 1) throw errors[0];
              if (errors.length > 1)
                throw new AggregateError(errors, "Input sources failed during dispose");
            },
            snapshot() {
              return {
                activeContexts: router.activeContexts()
              };
            }
          }
        };
      }
    );
  },
  ui<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.ui,
      (ctx, options) => {
        const ui = resolveStandardValue(ctx, options.runtime);
        ctx.state.ui = ui;
        return {
          key: UI_SERVICE,
          service: ui,
          standard: "ui",
          lifecycle: {
            id: UI_SERVICE.id,
            dependencies: ctx.service.dependencies,
            boot() {
              for (const panel of options.panels?.(ctx) ?? []) {
                if (!ui.panel(panel.id)) {
                  ui.registerPanel(panel);
                }
              }
              for (const panelId of options.openPanels?.(ctx) ?? []) {
                ui.open(panelId);
              }
            },
            snapshot() {
              return ui.snapshot();
            }
          }
        };
      }
    );
  },
  save<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.save,
      (ctx, options) => {
        let manager;
        if (options.manager !== undefined) {
          manager = resolveStandardValue(ctx, options.manager);
        } else {
          if (options.store === undefined) {
            throw new Error("Standard save service requires manager or store");
          }
          manager = createSaveManager({
            appId: resolveStandardValue(ctx, options.appId ?? ctx.app.id),
            gameId: resolveStandardValue(ctx, options.gameId ?? ctx.app.id),
            gameVersion: resolveStandardValue(ctx, options.gameVersion ?? "0.1.0"),
            formatVersion: resolveStandardValue(ctx, options.formatVersion),
            store: resolveStandardValue(ctx, options.store),
            ...(options.contributorPolicy === undefined
              ? {}
              : { contributorPolicy: resolveStandardValue(ctx, options.contributorPolicy) }),
            ...(options.codec === undefined
              ? {}
              : { codec: resolveStandardValue(ctx, options.codec) }),
            ...(options.migrations === undefined
              ? {}
              : { migrations: resolveStandardValue(ctx, options.migrations) }),
            ...(options.compatibility === undefined
              ? {}
              : { compatibility: resolveStandardValue(ctx, options.compatibility) }),
            services: () =>
              createSaveServiceContext(
                ctx.state,
                options.serviceContext === undefined
                  ? undefined
                  : resolveStandardValue(ctx, options.serviceContext)
              )
          });
        }
        ctx.state.save = manager;
        for (const contributor of options.contributors?.(ctx, manager) ?? []) {
          if (!manager.listContributors().some((registered) => registered.id === contributor.id)) {
            manager.registerContributor(contributor);
          }
        }
        return {
          key: SAVE_SERVICE,
          service: manager,
          standard: "save",
          lifecycle: {
            id: SAVE_SERVICE.id,
            dependencies: ctx.service.dependencies,
            snapshot() {
              return manager.snapshot();
            }
          }
        };
      }
    );
  },
  devtools<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    const devtoolsOptions = normalizeStandardDevToolsOptions(profile.standard?.devtools);
    if (devtoolsOptions === undefined) {
      return undefined;
    }

    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      devtoolsOptions,
      (ctx, options) => {
        let ownsRuntime = true;
        let runtime: DevToolsRuntime;
        if (options.runtime === undefined) {
          runtime = createDevToolsRuntime(
            options.options === undefined ? undefined : resolveStandardValue(ctx, options.options)
          );
        } else {
          ownsRuntime = false;
          runtime = resolveStandardValue(ctx, options.runtime);
        }
        const cleanups: Array<() => void> = [];
        ctx.state.devtools = runtime;
        return {
          key: DEVTOOLS_SERVICE,
          service: runtime,
          standard: "devtools",
          lifecycle: {
            id: DEVTOOLS_SERVICE.id,
            dependencies: ctx.service.dependencies,
            boot(hostCtx) {
              if (ctx.state.game) {
                ctx.state.game.setProfiler(createStandardGameRuntimeProfiler(runtime));
                cleanups.push(() => ctx.state.game?.setProfiler(undefined));
              }
              for (const source of createStandardDevToolsDataSources(ctx, hostCtx, options)) {
                cleanups.push(runtime.registerDataSource(source));
              }
              for (const source of options.dataSources?.(ctx) ?? []) {
                cleanups.push(runtime.registerDataSource(source));
              }
              for (const panel of createStandardDevToolsPanels(options)) {
                cleanups.push(runtime.registerPanel(panel));
              }
              for (const panel of options.panels?.(ctx) ?? []) {
                cleanups.push(runtime.registerPanel(panel));
              }
              for (const command of options.commands?.(ctx) ?? []) {
                cleanups.push(runtime.registerCommand(command));
              }
              cleanups.push(...registerStandardDevToolsUiPanels(ctx, options));
            },
            dispose() {
              for (const cleanup of cleanups.splice(0).reverse()) {
                cleanup();
              }
              if (ownsRuntime) {
                runtime.dispose();
              }
            },
            snapshot() {
              return runtime.snapshot();
            }
          }
        };
      }
    );
  },
  game<TContext>(
    profile: AppProfile<TContext>,
    stateByContext: Map<TContext, StandardAppServiceState>
  ) {
    return createManagedStandardServiceFactory(
      profile,
      stateByContext,
      profile.standard?.game,
      (ctx, options) => {
        const modules = createStandardGameModules(ctx, options);
        const runtime =
          options.runtime === undefined
            ? options.createRuntime?.(ctx, modules)
            : resolveStandardValue(ctx, options.runtime);
        if (!runtime) {
          throw new Error("Standard game service requires runtime or createRuntime");
        }

        ctx.state.game = runtime;
        return {
          key: GAME_SERVICE,
          service: runtime,
          standard: "game",
          lifecycle: {
            id: GAME_SERVICE.id,
            dependencies: ctx.service.dependencies,
            start() {
              runtime.start();
            },
            tick(_ctx, frame) {
              runtime.tick(frame.delta);
            },
            stop() {
              runtime.stop();
            },
            dispose() {
              runtime.dispose();
            },
            snapshot() {
              return {
                running: runtime.isRunning(),
                clock: runtime.clock.snapshot(),
                modules: runtime.modules.map((module) => module.id),
                systems: runtime.systems.values().map((system) => system.id)
              };
            }
          }
        };
      }
    );
  }
};

function createManagedStandardServiceFactory<TContext, TOptions>(
  profile: AppProfile<TContext>,
  stateByContext: Map<TContext, StandardAppServiceState>,
  options: TOptions | undefined,
  create: (ctx: StandardServiceBuildContext<TContext>, options: TOptions) => AppServiceBinding
): AppServiceFactory<TContext> | undefined {
  if (!options) {
    return undefined;
  }

  return (ctx) => {
    const standardCtx = createStandardContext(ctx, stateByContext);
    const binding = create(standardCtx, options);
    exposeStandardState(profile, standardCtx);
    return binding;
  };
}

const DEFAULT_SAVE_SERVICE_CONTEXT_KEYS: StandardSaveServiceContextKey[] = [
  "data",
  "assets",
  "game"
];

const saveServiceContextResolvers: Record<
  StandardSaveServiceContextKey,
  (state: StandardAppServiceState) => unknown
> = {
  platform: (state) => state.platform,
  drivers: (state) => state.drivers,
  data: (state) => state.data,
  assets: (state) => state.assets,
  renderer: (state) => state.renderer,
  input: (state) => state.input,
  game: (state) => state.game,
  ui: (state) => state.ui,
  devtools: (state) => state.devtools
};

function createSaveServiceContext(
  state: StandardAppServiceState,
  options: StandardSaveServiceContextOptions | undefined
): Record<string, unknown> {
  const services: Record<string, unknown> = {};
  const include = new Set(options?.include ?? DEFAULT_SAVE_SERVICE_CONTEXT_KEYS);
  const exclude = new Set(options?.exclude ?? []);

  for (const key of include) {
    if (exclude.has(key)) {
      continue;
    }
    const value = saveServiceContextResolvers[key](state);
    if (value !== undefined) {
      services[key] = value;
    }
  }

  if (options?.extra) {
    Object.assign(services, options.extra);
  }

  return services;
}

function createDriverInputSources<TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  options: StandardInputOptions<TContext>,
  router: InputRouter
): InputSourceAdapter[] {
  const sources = options.driverSources === undefined ? [] : options.driverSources;

  return sources.map((source) => {
    const factory = resolveDriverInputSourceFactory(ctx, source.driver);
    return factory.createInputSource({
      source: source.source,
      onInput(event) {
        if (source.devices && !source.devices.includes(event.device)) {
          return;
        }
        router.handle(source.scope ? { ...event, scope: source.scope } : event);
      }
    });
  });
}
