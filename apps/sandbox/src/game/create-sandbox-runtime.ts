import { createEventBus, type GameEvent } from "@gamekit/event-bus";
import { createGame } from "@gamekit/game-runtime";
import { createKootaWorld } from "@gamekit/world-koota";
import { Position, Velocity } from "./components";
import { sandboxMotionModule } from "./modules/sandbox-motion-module";
import type { SandboxRuntime } from "./types";

export function createSandboxRuntime(seed = "hero-road-dev-seed"): SandboxRuntime {
  const world = createKootaWorld();
  const eventBus = createEventBus({ clock: () => Math.round(performance.now()) });
  const events: GameEvent[] = [];

  eventBus.onAny((event) => {
    events.push(event);
    if (events.length > 20) {
      events.shift();
    }
  });

  const runtime = createGame({
    modules: [sandboxMotionModule],
    world,
    eventBus,
    seed
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
