import type { AppProfile, AppServiceFactory } from "../definition/types";
import type { AppServiceBinding } from "../runtime/types";
import {
  ASSET_SERVICE,
  DATA_SERVICE,
  GAME_SERVICE,
  INPUT_SERVICE,
  PLATFORM_SERVICE,
  RENDERER_SERVICE
} from "../runtime/standard-keys";
import { createStandardContext, exposeStandardState } from "./context";
import { createStandardGameModules } from "./game-modules";
import { resolveStandardAdapter, resolveStandardValue } from "./resolve";
import type { StandardAppServiceState, StandardServiceBuildContext } from "./types";

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
        const renderer = resolveStandardAdapter(ctx, options.adapter, "renderer");
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
              if (boot) {
                await renderer.boot(boot);
              }
            },
            dispose() {
              renderer.destroy();
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
        const manager = resolveStandardValue(ctx, options.manager);
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
                await manager.loadGroup(group);
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
        const adapters = options.adapters?.(ctx, router) ?? [];
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
              for (const adapter of adapters) {
                adapter.stop();
              }
            },
            dispose() {
              for (const adapter of adapters) {
                adapter.destroy();
              }
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
