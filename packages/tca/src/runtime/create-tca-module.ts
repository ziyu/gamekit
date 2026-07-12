import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { createTcaRuntime } from "./create-tca-runtime";
import { bindTcaHandle, unbindTcaHandle } from "./create-tca-handle";
import { TCA_RULE_TYPE } from "./data-type";
import { bridgeTcaToEventBus } from "./event-bridge";
import type { CreateTcaModuleConfig, TcaRule } from "./types";

export function createTcaModule(config: CreateTcaModuleConfig) {
  return defineGameModule<GameInstallContext>({
    id: config.id ?? "gamekit.tca",
    install(ctx) {
      const eventBus = config.eventBus ?? ctx.eventBus;
      const runtime = createTcaRuntime({
        rules: config.dataRegistry
          .list<TcaRule>(config.ruleKind ?? TCA_RULE_TYPE)
          .map((doc) => doc.data),
        eventBus,
        definitions: config.definitions,
        handlers: config.handlers,
        traceStore: config.traceStore,
        dataRegistry: config.dataRegistry,
        game: ctx
      });
      const unsubscribe = bridgeTcaToEventBus(runtime, eventBus);
      const moduleId = config.id ?? "gamekit.tca";
      let handleBound = false;
      try {
        if (config.handle) {
          bindTcaHandle(config.handle, runtime, moduleId);
          handleBound = true;
        }
        config.onRuntime?.(runtime);
      } catch (error) {
        unsubscribe();
        if (config.handle && handleBound) {
          unbindTcaHandle(config.handle, moduleId);
        }
        runtime.dispose();
        throw error;
      }

      return () => {
        unsubscribe();
        if (config.handle) {
          unbindTcaHandle(config.handle, moduleId);
        }
        runtime.dispose();
      };
    }
  });
}
