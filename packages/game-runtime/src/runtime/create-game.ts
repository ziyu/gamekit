import { Clock, Registry, createSeededRng, type GameModule } from "@gamekit/core";
import { createSystemRegistry } from "./system-registry";
import type { CreateGameConfig, GameInstallContext, GameRuntime } from "./types";

export function createGame(config: CreateGameConfig): GameRuntime {
  const clock = new Clock();
  const rng = createSeededRng(config.seed);
  const systemRegistry = createSystemRegistry();
  const installedModules = new Registry<GameModule<GameInstallContext>>();

  const installContext: GameInstallContext = {
    world: config.world,
    eventBus: config.eventBus,
    rng,
    systems: systemRegistry
  };

  for (const module of config.modules) {
    installedModules.register(module.id, module);
    module.install(installContext);
    config.eventBus.emit("runtime.module_installed", { moduleId: module.id }, "game-runtime");
  }

  return {
    world: config.world,
    eventBus: config.eventBus,
    rng,
    clock,
    systems: systemRegistry,
    modules: installedModules.values(),
    start() {
      if (clock.snapshot().running) {
        return;
      }

      clock.start();
      config.eventBus.emit("runtime.started", { seed: config.seed }, "game-runtime");
    },
    stop() {
      if (!clock.snapshot().running) {
        return;
      }

      clock.stop();
      config.eventBus.emit("runtime.stopped", {}, "game-runtime");
    },
    tick(delta) {
      const snapshot = clock.tick(delta);
      if (!snapshot.running) {
        return;
      }

      for (const system of systemRegistry.values()) {
        system.update({
          world: config.world,
          delta: snapshot.delta,
          elapsed: snapshot.elapsed,
          tick: snapshot.ticks
        });
      }
    },
    isRunning() {
      return clock.snapshot().running;
    }
  };
}
