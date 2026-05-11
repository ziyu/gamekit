import type {
  RenderObjectConfig,
  RenderObjectPatch,
  RendererAdapter,
  RendererBootContext,
  RendererCapabilities
} from "@gamekit/renderer-core";

export type MemoryRenderObject = RenderObjectConfig & {
  id: string;
  animationId?: string;
};

export type MemoryRendererAdapter = RendererAdapter & {
  objects(): MemoryRenderObject[];
};

function createRendererView(rendererId: string): HTMLElement {
  if (typeof document !== "undefined") {
    const element = document.createElement("div");
    element.dataset.renderer = rendererId;
    return element;
  }

  return {
    dataset: { renderer: rendererId },
    remove() {
      // Test-only stand-in for environments without DOM globals.
    }
  } as unknown as HTMLElement;
}

export function createMemoryRenderer(id = "memory-renderer"): MemoryRendererAdapter {
  let nextId = 0;
  let view: HTMLElement | undefined;
  let width = 0;
  let height = 0;
  const objects = new Map<string, MemoryRenderObject>();
  const capabilities: RendererCapabilities = {
    objectTypes: ["debug.square", "sprite", "container"],
    supportsObjectTree: true
  };

  const requireObject = (objectId: string): MemoryRenderObject => {
    const object = objects.get(objectId);
    if (!object) {
      throw new Error(`Missing render object: ${objectId}`);
    }

    return object;
  };

  return {
    id,
    async boot(ctx: RendererBootContext) {
      view = createRendererView(id);
      width = ctx.width;
      height = ctx.height;
      ctx.container.append?.(view);
      ctx.eventBus?.emit("renderer.booted", { rendererId: id, width, height }, id);
    },
    destroy() {
      objects.clear();
      view?.remove();
      view = undefined;
    },
    getView() {
      if (!view) {
        throw new Error("Renderer has not booted");
      }

      return view;
    },
    capabilities() {
      return capabilities;
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
    },
    createObject(config) {
      if (!capabilities.objectTypes.includes(config.type)) {
        throw new Error(`Unsupported render object type: ${config.type}`);
      }

      const objectId = config.id ?? `render-object-${nextId}`;
      nextId += 1;
      if (objects.has(objectId)) {
        throw new Error(`Duplicate render object: ${objectId}`);
      }

      objects.set(objectId, { ...config, id: objectId });
      return objectId;
    },
    updateObject(objectId, patch: RenderObjectPatch) {
      const object = requireObject(objectId);
      objects.set(objectId, {
        ...object,
        ...patch,
        transform: { ...object.transform, ...patch.transform },
        props: { ...object.props, ...patch.props }
      });
    },
    setParent(objectId, parentId) {
      const object = requireObject(objectId);
      if (parentId) {
        requireObject(parentId);
      }

      const nextObject: MemoryRenderObject = { ...object };
      if (parentId) {
        nextObject.parentId = parentId;
      } else {
        delete nextObject.parentId;
      }

      objects.set(objectId, nextObject);
    },
    destroyObject(objectId) {
      if (!objects.delete(objectId)) {
        throw new Error(`Missing render object: ${objectId}`);
      }
    },
    playAnimation(objectId, animationId) {
      const object = requireObject(objectId);
      objects.set(objectId, { ...object, animationId });
    },
    objects() {
      return [...objects.values()];
    }
  };
}
