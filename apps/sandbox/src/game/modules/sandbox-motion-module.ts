import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { Position, RenderObjectPresentation, Velocity } from "../components";

const ENTITY_TINTS = [0xf3f0e8, 0x7fd16b, 0xdd3627, 0xf0bd4f, 0x64c2d0] as const;

export const sandboxMotionModule = defineGameModule<GameInstallContext>({
  id: "sandbox.motion",
  install(ctx) {
    for (let i = 0; i < 5; i += 1) {
      const entity = ctx.world.spawn();
      ctx.world.add(entity, Position, {
        x: 16 + i * 12,
        y: 24 + i * 9
      });
      ctx.world.add(entity, Velocity, {
        x: ctx.rng.int(1, 4),
        y: ctx.rng.int(1, 3)
      });
      ctx.world.add(entity, RenderObjectPresentation, {
        definition: {
          type: "debug.square",
          props: {
            width: 20 + (i % 2) * 6,
            height: 20 + (i % 2) * 6,
            depth: i,
            tint: ENTITY_TINTS[i] ?? ENTITY_TINTS[0]
          }
        }
      });
      ctx.eventBus.emit("sandbox.entity_spawned", { entity }, "sandbox.motion");
    }

    ctx.systems.register({
      id: "sandbox.motion_system",
      update({ world: gameWorld, delta, tick }) {
        for (const entity of gameWorld.query([Position, Velocity])) {
          const position = gameWorld.get(entity, Position);
          const velocity = gameWorld.get(entity, Velocity);
          if (!position || !velocity) {
            continue;
          }

          const seconds = delta / 1000;
          gameWorld.set(entity, Position, {
            x: wrap(position.x + velocity.x * 24 * seconds, 100),
            y: wrap(position.y + velocity.y * 24 * seconds, 100)
          });
        }

        if (tick % 60 === 0) {
          ctx.eventBus.emit("sandbox.motion_tick", { tick }, "sandbox.motion_system");
        }
      }
    });
  }
});

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}
