import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { RenderObjectDefinition, RendererAdapter } from "@gamekit/renderer-core";
import { Position, RenderObjectPresentation } from "../components";

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
        update({ world, tick }) {
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
          }

          if (tick % 120 === 0) {
            ctx.eventBus.emit("sandbox.render_sync_tick", { tick }, "sandbox.render_sync");
          }
        }
      });
    }
  });
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
