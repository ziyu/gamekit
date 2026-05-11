import { createEventBus, type GameEvent } from "@gamekit/event-bus";
import { createGame } from "@gamekit/game-runtime";
import type { RendererAdapter } from "@gamekit/renderer-core";
import { createKootaWorld } from "@gamekit/world-koota";
import { Position, Velocity } from "./components";
import { createSandboxRenderSyncModule } from "./modules/sandbox-render-sync-module";
import { sandboxMotionModule } from "./modules/sandbox-motion-module";
import type { SandboxRuntime } from "./types";

export const SANDBOX_RENDER_SIZE = {
  width: 720,
  height: 524
} as const;

export type CreateSandboxRuntimeOptions = {
  seed?: string;
  renderer?: RendererAdapter;
  renderSize?: {
    width: number;
    height: number;
  };
};

export function createSandboxRuntime(
  seedOrOptions: string | CreateSandboxRuntimeOptions = "hero-road-dev-seed"
): SandboxRuntime {
  const options = typeof seedOrOptions === "string" ? { seed: seedOrOptions } : seedOrOptions;
  const world = createKootaWorld();
  const eventBus = createEventBus({ clock: () => Math.round(performance.now()) });
  const events: GameEvent[] = [];
  const modules = [sandboxMotionModule];

  if (options.renderer) {
    modules.push(
      createSandboxRenderSyncModule({
        renderer: options.renderer,
        size: options.renderSize ?? SANDBOX_RENDER_SIZE
      })
    );
  }

  eventBus.onAny((event) => {
    events.push(event);
    if (events.length > 20) {
      events.shift();
    }
  });

  const runtime = createGame({
    modules,
    world,
    eventBus,
    seed: options.seed ?? "hero-road-dev-seed"
  });

  return {
    runtime,
    events,
    snapshot() {
      const entities = world.query([Position, Velocity]).map((entity) => {
        const position = world.get(entity, Position);
        const velocity = world.get(entity, Velocity);

        return {
          id: entity,
          x: position?.x ?? 0,
          y: position?.y ?? 0,
          vx: velocity?.x ?? 0,
          vy: velocity?.y ?? 0
        };
      });

      return {
        running: runtime.isRunning(),
        clock: runtime.clock.snapshot(),
        entityCount: world.count(),
        entities,
        events: [...events]
      };
    }
  };
}
