import { GameError } from "@gamekit/core";
import type {
  RenderObjectConfig,
  RenderObjectId,
  RendererAdapter,
  RendererBootContext,
  RendererCapabilities,
  RenderObjectPatch
} from "@gamekit/renderer-core";
import { createDefaultPhaserDriver } from "./phaser-driver";
import type { PhaserRendererDriverRuntime, PhaserRendererOptions } from "./types";

const DEFAULT_BACKGROUND_COLOR = "#171813";
const DEFAULT_DEBUG_TEXTURE_ID = "gamekit.debug.square";

export function createPhaserRenderer(options: PhaserRendererOptions = {}): RendererAdapter {
  const rendererId = options.id ?? "renderer.phaser";
  const driver = options.driver ?? createDefaultPhaserDriver();
  const backgroundColor = options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const debugTextureId = options.debugTextureId ?? DEFAULT_DEBUG_TEXTURE_ID;
  const liveObjects = new Set<RenderObjectId>();
  let nextObjectId = 0;
  let runtime: PhaserRendererDriverRuntime | undefined;
  let bootContext: RendererBootContext | undefined;

  const requireRuntime = (): PhaserRendererDriverRuntime => {
    if (!runtime) {
      throw new GameError("renderer.not_booted", "Renderer has not booted", { rendererId });
    }

    return runtime;
  };

  const requireObject = (objectId: RenderObjectId): void => {
    if (!liveObjects.has(objectId)) {
      throw new GameError("renderer.missing_object", `Missing render object: ${objectId}`, {
        rendererId,
        objectId
      });
    }
  };

  const ensureSupportedType = (config: RenderObjectConfig): void => {
    const capabilities = driver.capabilities();
    if (!capabilities.objectTypes.includes(config.type)) {
      throw new GameError(
        "renderer.unsupported_object_type",
        `Renderer does not support render object type: ${config.type}`,
        {
          rendererId,
          objectType: config.type
        }
      );
    }
  };

  return {
    id: rendererId,
    async boot(ctx) {
      if (runtime) {
        return;
      }

      bootContext = ctx;
      runtime = await driver.boot(ctx, { backgroundColor, debugTextureId });
      ctx.eventBus?.emit(
        "renderer.booted",
        { rendererId, width: ctx.width, height: ctx.height },
        rendererId
      );
    },
    destroy() {
      runtime?.destroy();
      runtime = undefined;
      bootContext?.eventBus?.emit("renderer.destroyed", { rendererId }, rendererId);
      bootContext = undefined;
      liveObjects.clear();
    },
    getView() {
      return requireRuntime().view;
    },
    capabilities(): RendererCapabilities {
      return driver.capabilities();
    },
    resize(width, height) {
      requireRuntime().resize(width, height);
      bootContext?.eventBus?.emit("renderer.resized", { rendererId, width, height }, rendererId);
    },
    createObject(config: RenderObjectConfig) {
      ensureSupportedType(config);
      const objectId = config.id ?? `render-object-${nextObjectId}`;
      nextObjectId += 1;
      if (liveObjects.has(objectId)) {
        throw new GameError("renderer.duplicate_object", `Duplicate render object: ${objectId}`, {
          rendererId,
          objectId
        });
      }

      requireRuntime().createObject(objectId, config);
      liveObjects.add(objectId);
      bootContext?.eventBus?.emit(
        "renderer.object_created",
        { rendererId, objectId, type: config.type },
        rendererId
      );
      return objectId;
    },
    updateObject(objectId, patch: RenderObjectPatch) {
      requireObject(objectId);
      requireRuntime().updateObject(objectId, patch);
    },
    setParent(objectId, parentId) {
      requireObject(objectId);
      if (parentId) {
        requireObject(parentId);
      }

      requireRuntime().setParent(objectId, parentId);
    },
    destroyObject(objectId) {
      requireObject(objectId);
      requireRuntime().destroyObject(objectId);
      liveObjects.delete(objectId);
      bootContext?.eventBus?.emit(
        "renderer.object_destroyed",
        { rendererId, objectId },
        rendererId
      );
    },
    playAnimation(objectId, animationId) {
      requireObject(objectId);
      requireRuntime().playAnimation(objectId, animationId);
    }
  };
}
