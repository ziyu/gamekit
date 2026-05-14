import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { createGasRuntime } from "./create-gas-runtime";
import type { CreateGasModuleConfig } from "./types";

export function createGasModule(config: CreateGasModuleConfig) {
  return defineGameModule<GameInstallContext>({
    id: config.id ?? "gamekit.gas",
    install(ctx) {
      const runtime = createGasRuntime({
        world: ctx.world,
        dataRegistry: config.dataRegistry,
        eventBus: config.eventBus ?? ctx.eventBus,
        traceStore: config.traceStore
      });

      config.onRuntime?.(runtime);

      ctx.systems.register({
        id: `${config.id ?? "gamekit.gas"}.effects`,
        update(systemCtx) {
          runtime.update(systemCtx.delta, systemCtx.elapsed);
        }
      });

      return () => {
        runtime.dispose();
      };
    }
  });
}
