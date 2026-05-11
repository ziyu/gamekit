import { GameError } from "@gamekit/core";
import type {
  RenderCommand,
  RenderNodePath,
  RenderNodePatch,
  RenderObjectDefinition,
  RenderObjectHandle,
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

  const emitDiagnostic = (type: string, payload: Record<string, unknown>): void => {
    bootContext?.onDiagnostic?.({ type, payload, source: rendererId });
  };

  const ensureSupportedType = (definition: RenderObjectDefinition): void => {
    const capabilities = driver.capabilities();
    if (!capabilities.objectTypes.includes(definition.type)) {
      throw new GameError(
        "renderer.unsupported_object_type",
        `Renderer does not support render object type: ${definition.type}`,
        {
          rendererId,
          objectType: definition.type
        }
      );
    }

    for (const child of definition.children ?? []) {
      ensureSupportedType(child);
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
      options.onRuntime?.(runtime);
      emitDiagnostic("renderer.booted", { rendererId, width: ctx.width, height: ctx.height });
    },
    destroy() {
      runtime?.destroy();
      runtime = undefined;
      emitDiagnostic("renderer.destroyed", { rendererId });
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
      emitDiagnostic("renderer.resized", { rendererId, width, height });
    },
    createObject(definition: RenderObjectDefinition) {
      ensureSupportedType(definition);
      const objectId = definition.id ?? `render-object-${nextObjectId}`;
      nextObjectId += 1;
      if (liveObjects.has(objectId)) {
        throw new GameError("renderer.duplicate_object", `Duplicate render object: ${objectId}`, {
          rendererId,
          objectId
        });
      }

      requireRuntime().createObject(objectId, definition);
      liveObjects.add(objectId);
      emitDiagnostic("renderer.object_created", { rendererId, objectId, type: definition.type });
      return objectId;
    },
    updateObject(objectId, patch: RenderObjectPatch) {
      requireObject(objectId);
      requireRuntime().updateObject(objectId, patch);
    },
    updateNode(objectId, nodePath: RenderNodePath, patch: RenderNodePatch) {
      requireObject(objectId);
      requireRuntime().updateNode(objectId, nodePath, patch);
    },
    destroyObject(objectId) {
      requireObject(objectId);
      requireRuntime().destroyObject(objectId);
      liveObjects.delete(objectId);
      emitDiagnostic("renderer.object_destroyed", { rendererId, objectId });
    },
    command(objectId, command: RenderCommand) {
      requireObject(objectId);
      requireRuntime().command(objectId, command);
    },
    getObjectHandle(objectId): RenderObjectHandle<unknown, unknown> {
      requireObject(objectId);
      return requireRuntime().getObjectHandle(objectId);
    }
  };
}
