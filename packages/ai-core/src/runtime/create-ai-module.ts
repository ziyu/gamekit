import { defineGameModule, type GameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { bindAiHandle, unbindAiHandle } from "./create-ai-handle";
import { createAiRuntime } from "./create-ai-runtime";
import type { AiRuntime, CreateAiModuleOptions } from "./types";

export function createAiModule(options: CreateAiModuleOptions): GameModule<GameInstallContext> {
  const moduleId = options.id ?? "ai";
  return defineGameModule<GameInstallContext>({
    id: moduleId,
    install(context) {
      let runtime: AiRuntime | undefined;
      let handleBound = false;
      try {
        runtime = createAiRuntime({
          ...options,
          id: moduleId,
          world: context.world,
          eventBus: options.eventBus ?? context.eventBus
        });
        if (options.handle !== undefined) {
          bindAiHandle(options.handle, runtime, moduleId);
          handleBound = true;
        }
        options.onRuntime?.(runtime, context);
        context.systems.register({
          id: `${moduleId}.update`,
          update(systemContext) {
            runtime?.update(systemContext.delta, systemContext.elapsed);
          }
        });
      } catch (error) {
        if (handleBound && options.handle !== undefined) {
          unbindAiHandle(options.handle, moduleId);
        }
        runtime?.dispose();
        throw error;
      }
      return {
        dispose() {
          if (options.handle !== undefined) {
            unbindAiHandle(options.handle, moduleId);
          }
          runtime?.dispose();
          runtime = undefined;
        }
      };
    }
  });
}
