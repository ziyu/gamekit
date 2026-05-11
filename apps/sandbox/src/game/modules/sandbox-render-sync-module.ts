import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type {
  RenderNodePatch,
  RenderObjectDefinition,
  RendererAdapter
} from "@gamekit/renderer-core";
import { Position, RenderObjectPresentation, type SandboxRenderNodeAnimation } from "../components";

export type SandboxRenderSize = {
  width: number;
  height: number;
};

export type SandboxRenderSyncOptions = {
  renderer: RendererAdapter;
  size: SandboxRenderSize;
};

export function createSandboxRenderSyncModule(options: SandboxRenderSyncOptions) {
  return defineGameModule<GameInstallContext>({
    id: "sandbox.render_sync",
    install(ctx) {
      ctx.eventBus.emit(
        "sandbox.renderer_sync_installed",
        { rendererId: options.renderer.id },
        "sandbox.render_sync"
      );

      ctx.systems.register({
        id: "sandbox.render_sync_system",
        update({ world, tick, elapsed }) {
          for (const entity of world.query([Position, RenderObjectPresentation])) {
            const position = world.get(entity, Position);
            const presentation = world.get(entity, RenderObjectPresentation);
            if (!position || !presentation) {
              continue;
            }

            const x = toPixel(position.x, options.size.width);
            const y = toPixel(position.y, options.size.height);

            if (!presentation.renderObjectId) {
              const renderObjectId = options.renderer.createObject(
                createObjectDefinition({ x, y, presentation })
              );
              world.set(entity, RenderObjectPresentation, { ...presentation, renderObjectId });
              ctx.eventBus.emit(
                "sandbox.render_object_linked",
                { entity, renderObjectId },
                "sandbox.render_sync"
              );
              continue;
            }

            options.renderer.updateObject(presentation.renderObjectId, {
              transform: { position: { x, y } }
            });
            applyNodeAnimations(
              options.renderer,
              presentation.renderObjectId,
              presentation,
              elapsed
            );
          }

          if (tick % 120 === 0) {
            ctx.eventBus.emit("sandbox.render_sync_tick", { tick }, "sandbox.render_sync");
          }
        }
      });
    }
  });
}

function applyNodeAnimations(
  renderer: RendererAdapter,
  renderObjectId: string,
  presentation: ReturnType<typeof RenderObjectPresentation.create>,
  elapsed: number
): void {
  if (!renderer.updateNode || !presentation.nodeAnimations) {
    return;
  }

  const seconds = elapsed / 1000;
  for (const animation of presentation.nodeAnimations) {
    renderer.updateNode(renderObjectId, animation.nodePath, createNodePatch(animation, seconds));
  }
}

function createNodePatch(animation: SandboxRenderNodeAnimation, seconds: number): RenderNodePatch {
  const phase = animation.phase ?? 0;
  const wave = Math.sin(seconds * animation.speed + phase);

  if (animation.kind === "orbit") {
    return {
      transform: {
        position: {
          x: Math.cos(seconds * animation.speed + phase) * animation.radius,
          y: Math.sin(seconds * animation.speed + phase) * animation.radius
        }
      }
    };
  }

  if (animation.kind === "pulse") {
    const scale = 1 + wave * animation.scale;
    const patch: RenderNodePatch = {
      transform: {
        scale: { x: scale, y: scale }
      }
    };

    if (animation.alpha) {
      patch.alpha =
        animation.alpha.min + ((wave + 1) / 2) * (animation.alpha.max - animation.alpha.min);
    }

    return patch;
  }

  return {
    transform: {
      rotation: {
        z: seconds * animation.speed + phase
      }
    }
  };
}

function createObjectDefinition(input: {
  x: number;
  y: number;
  presentation: ReturnType<typeof RenderObjectPresentation.create>;
}): RenderObjectDefinition {
  return {
    ...input.presentation.definition,
    transform: {
      ...input.presentation.definition.transform,
      position: {
        ...input.presentation.definition.transform?.position,
        x: input.x,
        y: input.y
      }
    }
  };
}

function toPixel(percent: number, size: number): number {
  return (percent / 100) * size;
}
