import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { RenderNodeDefinition, RenderObjectDefinition } from "@gamekit/renderer-core";
import type { SandboxActorDefinition, SandboxRenderRigDefinition } from "../sandbox-data";
import { Position, RenderObjectPresentation, Velocity } from "../components";

const ENTITY_TINTS = [0xf3f0e8, 0x7fd16b, 0xdd3627, 0xf0bd4f, 0x64c2d0] as const;

export type SandboxMotionModuleOptions = {
  actorDefinition: SandboxActorDefinition;
  renderObjectDefinition: RenderObjectDefinition;
  renderRigDefinition: SandboxRenderRigDefinition;
};

export function createSandboxMotionModule(options: SandboxMotionModuleOptions) {
  return defineGameModule<GameInstallContext>({
    id: "sandbox.motion",
    install(ctx) {
      for (let i = 0; i < options.actorDefinition.entityCount; i += 1) {
        const { id: _renderObjectDataId, ...renderObjectDefinition } =
          options.renderObjectDefinition;
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
          definition: createEntityRenderObjectDefinition(renderObjectDefinition, i),
          nodeAnimations: options.renderRigDefinition.nodeAnimations
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
              x: wrap(position.x + velocity.x * options.actorDefinition.baseSpeed * seconds, 100),
              y: wrap(position.y + velocity.y * options.actorDefinition.baseSpeed * seconds, 100)
            });
          }

          if (tick % 60 === 0) {
            ctx.eventBus.emit("sandbox.motion_tick", { tick }, "sandbox.motion_system");
          }
        }
      });
    }
  });
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

function createEntityRenderObjectDefinition(
  definition: RenderObjectDefinition,
  index: number
): RenderObjectDefinition {
  const nextDefinition: RenderObjectDefinition = {
    ...definition,
    props: {
      ...definition.props,
      depth: index
    }
  };

  if (definition.children) {
    nextDefinition.children = definition.children.map((child) =>
      createEntityRenderNodeDefinition(child, index)
    );
  }

  return nextDefinition;
}

function createEntityRenderNodeDefinition(
  definition: RenderNodeDefinition,
  index: number
): RenderNodeDefinition {
  const tint = ENTITY_TINTS[index] ?? ENTITY_TINTS[0];
  const props = { ...definition.props };

  if (definition.id === "body") {
    props.tint = tint;
    props.width = 22 + (index % 2) * 5;
    props.height = 22 + (index % 2) * 5;
  }
  if (definition.id === "aura") {
    props.tint = tint;
  }

  const nextDefinition: RenderNodeDefinition = {
    ...definition,
    props
  };

  if (definition.children) {
    nextDefinition.children = definition.children.map((child) =>
      createEntityRenderNodeDefinition(child, index)
    );
  }

  return nextDefinition;
}
