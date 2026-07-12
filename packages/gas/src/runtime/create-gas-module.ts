import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { bindGasHandle, unbindGasHandle } from "./create-gas-handle";
import { createGasRuntime } from "./create-gas-runtime";
import type { CreateGasModuleConfig } from "./types";

export function createGasModule(config: CreateGasModuleConfig) {
  return defineGameModule<GameInstallContext>({
    id: config.id ?? "gamekit.gas",
    install(ctx) {
      const moduleId = config.id ?? "gamekit.gas";
      const runtime = createGasRuntime({
        world: ctx.world,
        dataRegistry: config.dataRegistry,
        eventBus: config.eventBus ?? ctx.eventBus,
        traceStore: config.traceStore
      });

      try {
        if (config.handle) {
          bindGasHandle(config.handle, runtime, moduleId);
        }
        config.onRuntime?.(runtime);
      } catch (error) {
        if (config.handle?.isBound()) {
          unbindGasHandle(config.handle, moduleId);
        }
        runtime.dispose();
        throw error;
      }

      ctx.systems.register({
        id: `${moduleId}.effects`,
        update(systemCtx) {
          runtime.update(systemCtx.delta, systemCtx.elapsed);
        }
      });

      return () => {
        if (config.handle) {
          unbindGasHandle(config.handle, moduleId);
        }
        runtime.dispose();
      };
    }
  });
}
