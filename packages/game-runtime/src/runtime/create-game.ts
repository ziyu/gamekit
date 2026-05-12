import {
  Clock,
  Registry,
  createSeededRng,
  type GameModule,
  type GameModuleInstallResult
} from "@gamekit/core";
import { createSystemRegistry } from "./system-registry";
import type { CreateGameConfig, GameInstallContext, GameRuntime } from "./types";

export function createGame(config: CreateGameConfig): GameRuntime {
  const clock = new Clock();
  const rng = createSeededRng(config.seed);
  const systemRegistry = createSystemRegistry();
  const installedModules = new Registry<GameModule<GameInstallContext>>();
  const cleanups: Array<() => void> = [];
  let disposed = false;

  const installContext: GameInstallContext = {
    world: config.world,
    eventBus: config.eventBus,
    rng,
    systems: systemRegistry
  };

  for (const module of config.modules) {
    installedModules.register(module.id, module);
    const cleanup = toModuleCleanup(module.install(installContext));
    if (cleanup) {
      cleanups.push(cleanup);
    }
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
      if (disposed) {
        return;
      }

      if (clock.snapshot().running) {
        return;
      }

      clock.start();
      config.eventBus.emit("runtime.started", { seed: config.seed }, "game-runtime");
    },
    stop() {
      if (disposed) {
        return;
      }

      if (!clock.snapshot().running) {
        return;
      }

      clock.stop();
      config.eventBus.emit("runtime.stopped", {}, "game-runtime");
    },
    tick(delta) {
      if (disposed) {
        return;
      }

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
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      if (clock.snapshot().running) {
        clock.stop();
        config.eventBus.emit("runtime.stopped", {}, "game-runtime");
      }

      for (const cleanup of [...cleanups].reverse()) {
        cleanup();
      }
      cleanups.length = 0;
      config.eventBus.emit("runtime.disposed", {}, "game-runtime");
    },
    isRunning() {
      return !disposed && clock.snapshot().running;
    }
  };
}

function toModuleCleanup(result: GameModuleInstallResult): (() => void) | undefined {
  if (typeof result === "function") {
    return result;
  }

  if (result && typeof result.dispose === "function") {
    return () => result.dispose();
  }

  return undefined;
}
