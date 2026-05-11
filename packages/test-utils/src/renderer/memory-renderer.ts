import type {
  RenderCommand,
  RenderNodePatch,
  RenderNodePath,
  RenderObjectDefinition,
  RenderObjectPatch,
  RendererAdapter,
  RendererBootContext,
  RendererCapabilities,
  RenderTransform
} from "@gamekit/renderer-core";

export type MemoryRenderObject = RenderObjectDefinition & {
  id: string;
  commands: RenderCommand[];
  nodes: Map<string, MemoryRenderNode>;
};

export type MemoryRenderNode = {
  id: string;
  type: string;
  transform?: RenderTransform;
  props?: Record<string, unknown>;
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
  let onDiagnostic: RendererBootContext["onDiagnostic"];
  const capabilities: RendererCapabilities = {
    objectTypes: ["debug.square", "sprite", "container"],
    supportsObjectTree: true,
    supportsNodeUpdates: true,
    commandTypes: ["animation.play"],
    supportsNativeHandles: true
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
      onDiagnostic = ctx.onDiagnostic;
      ctx.container.append?.(view);
      onDiagnostic?.({
        type: "renderer.booted",
        payload: { rendererId: id, width, height },
        source: id
      });
    },
    destroy() {
      objects.clear();
      view?.remove();
      view = undefined;
      onDiagnostic?.({ type: "renderer.destroyed", payload: { rendererId: id }, source: id });
      onDiagnostic = undefined;
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
      onDiagnostic?.({
        type: "renderer.resized",
        payload: { rendererId: id, width, height },
        source: id
      });
    },
    createObject(definition) {
      if (!capabilities.objectTypes.includes(definition.type)) {
        throw new Error(`Unsupported render object type: ${definition.type}`);
      }

      const objectId = definition.id ?? `render-object-${nextId}`;
      nextId += 1;
      if (objects.has(objectId)) {
        throw new Error(`Duplicate render object: ${objectId}`);
      }

      objects.set(objectId, {
        ...definition,
        id: objectId,
        commands: [],
        nodes: createNodeMap(definition.children)
      });
      onDiagnostic?.({
        type: "renderer.object_created",
        payload: { rendererId: id, objectId, type: definition.type },
        source: id
      });
      return objectId;
    },
    updateObject(objectId, patch: RenderObjectPatch) {
      const object = requireObject(objectId);
      const nextObject: MemoryRenderObject = {
        ...object,
        ...patch,
        props: { ...object.props, ...patch.props }
      };
      const transform = mergeTransform(object.transform, patch.transform);
      if (transform) {
        nextObject.transform = transform;
      } else {
        delete nextObject.transform;
      }

      objects.set(objectId, nextObject);
    },
    updateNode(objectId, nodePath: RenderNodePath, patch: RenderNodePatch) {
      const object = requireObject(objectId);
      const path = resolveNodePath(nodePath);
      const node = object.nodes.get(path);
      if (!node) {
        throw new Error(`Missing render node: ${path}`);
      }

      const nextNode: MemoryRenderNode = {
        ...node,
        ...patch,
        props: { ...node.props, ...patch.props }
      };
      const transform = mergeTransform(node.transform, patch.transform);
      if (transform) {
        nextNode.transform = transform;
      } else {
        delete nextNode.transform;
      }

      object.nodes.set(path, nextNode);
    },
    destroyObject(objectId) {
      if (!objects.delete(objectId)) {
        throw new Error(`Missing render object: ${objectId}`);
      }
      onDiagnostic?.({
        type: "renderer.object_destroyed",
        payload: { rendererId: id, objectId },
        source: id
      });
    },
    command(objectId, command) {
      const object = requireObject(objectId);
      if (command.type !== "animation.play") {
        throw new Error(`Unsupported render command: ${command.type}`);
      }

      objects.set(objectId, { ...object, commands: [...object.commands, command] });
    },
    getObjectHandle(objectId) {
      const object = requireObject(objectId);
      return {
        id: objectId,
        type: object.type,
        native: object,
        escaped: true
      };
    },
    objects() {
      return [...objects.values()];
    }
  };
}

function createNodeMap(
  children: RenderObjectDefinition["children"] = [],
  prefix: string[] = []
): Map<string, MemoryRenderNode> {
  const nodes = new Map<string, MemoryRenderNode>();
  for (const child of children) {
    const nodeId = child.id ?? `${child.type}-${nodes.size}`;
    const nodePath = [...prefix, nodeId].join("/");
    const node: MemoryRenderNode = {
      id: nodeId,
      type: child.type
    };
    if (child.transform) {
      node.transform = child.transform;
    }
    if (child.props) {
      node.props = child.props;
    }
    nodes.set(nodePath, node);

    for (const [path, node] of createNodeMap(child.children, [...prefix, nodeId])) {
      nodes.set(path, node);
    }
  }

  return nodes;
}

function resolveNodePath(nodePath: RenderNodePath): string {
  return Array.isArray(nodePath) ? nodePath.join("/") : nodePath;
}

function mergeTransform(
  current: RenderTransform | undefined,
  patch: RenderTransform | undefined
): RenderTransform | undefined {
  if (!patch) {
    return current;
  }

  return {
    ...current,
    ...patch,
    position: { ...current?.position, ...patch.position },
    rotation: { ...current?.rotation, ...patch.rotation },
    scale: { ...current?.scale, ...patch.scale },
    origin: { ...current?.origin, ...patch.origin }
  };
}
