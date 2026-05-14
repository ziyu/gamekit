import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { createTcaRuntime } from "./create-tca-runtime";
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
      config.onRuntime?.(runtime);

      return () => {
        unsubscribe();
        runtime.dispose();
      };
    }
  });
}
