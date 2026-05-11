import { describe, expect, it } from "vitest";
import type {
  RenderCommand,
  RenderNodePatch,
  RenderNodePath,
  RenderObjectDefinition,
  RendererCapabilities,
  RenderObjectHandle,
  RenderObjectPatch,
  RenderTransform
} from "@gamekit/renderer-core";
import { defineRendererConformanceTests } from "@gamekit/test-utils";
import {
  createPhaserRenderer,
  type PhaserRendererDriver,
  type PhaserRendererDriverRuntime
} from "../src";

type FakeRenderObject = RenderObjectDefinition & {
  id: string;
  commands: RenderCommand[];
  nodes: Map<string, FakeRenderNode>;
};

type FakeRenderNode = {
  id: string;
  type: string;
  transform?: RenderTransform;
  props?: Record<string, unknown>;
};

type FakeDriver = PhaserRendererDriver & {
  objects(): FakeRenderObject[];
};

function createFakeDriver(): FakeDriver {
  const objects = new Map<string, FakeRenderObject>();
  const capabilities: RendererCapabilities = {
    objectTypes: ["debug.square", "sprite", "container"],
    supportsObjectTree: true,
    supportsNodeUpdates: true,
    commandTypes: ["animation.play"],
    supportsNativeHandles: true
  };

  const runtime: PhaserRendererDriverRuntime = {
    view: { remove() {} } as unknown as HTMLElement,
    resize() {},
    destroy() {
      objects.clear();
    },
    createObject(id: string, definition: RenderObjectDefinition) {
      objects.set(id, {
        ...definition,
        id,
        commands: [],
        nodes: createNodeMap(definition.children)
      });
    },
    updateObject(id: string, patch: RenderObjectPatch) {
      const object = objects.get(id);
      if (!object) {
        return;
      }

      objects.set(id, {
        ...object,
        ...patch,
        transform: mergeTransform(object.transform, patch.transform),
        props: { ...object.props, ...patch.props }
      });
    },
    updateNode(id: string, nodePath: RenderNodePath, patch: RenderNodePatch) {
      const object = objects.get(id);
      if (!object) {
        return;
      }

      const path = resolveNodePath(nodePath);
      const node = object.nodes.get(path);
      if (!node) {
        throw new Error(`Missing render node: ${path}`);
      }

      object.nodes.set(path, {
        ...node,
        ...patch,
        transform: mergeTransform(node.transform, patch.transform),
        props: { ...node.props, ...patch.props }
      });
    },
    destroyObject(id: string) {
      objects.delete(id);
    },
    command(id: string, command: RenderCommand) {
      if (command.type !== "animation.play") {
        throw new Error(`Unsupported render command: ${command.type}`);
      }

      const object = objects.get(id);
      if (object) {
        objects.set(id, { ...object, commands: [...object.commands, command] });
      }
    },
    getObjectHandle(id: string): RenderObjectHandle<unknown, unknown> {
      const object = objects.get(id);
      if (!object) {
        throw new Error(`Missing render object: ${id}`);
      }

      return { id, type: object.type, native: object, escaped: true };
    }
  };

  return {
    capabilities() {
      return capabilities;
    },
    async boot() {
      return runtime;
    },
    objects() {
      return [...objects.values()];
    }
  };
}

function createTestContainer(): HTMLElement {
  return { append() {} } as unknown as HTMLElement;
}

defineRendererConformanceTests("Phaser", () =>
  createPhaserRenderer({ driver: createFakeDriver() })
);

describe("createPhaserRenderer", () => {
  it("emits renderer lifecycle and object diagnostics", async () => {
    const driver = createFakeDriver();
    const diagnostics: string[] = [];
    const renderer = createPhaserRenderer({ id: "test.phaser", driver });

    await renderer.boot({
      container: createTestContainer(),
      width: 320,
      height: 240,
      onDiagnostic: (event) => diagnostics.push(event.type)
    });
    renderer.resize(640, 480);
    const objectId = renderer.createObject({
      type: "debug.square",
      transform: { position: { x: 10, y: 20 } }
    });
    renderer.destroyObject(objectId);
    renderer.destroy();

    expect(diagnostics).toEqual([
      "renderer.booted",
      "renderer.resized",
      "renderer.object_created",
      "renderer.object_destroyed",
      "renderer.destroyed"
    ]);
  });

  it("rejects unsupported render object types before reaching the driver", async () => {
    const driver = createFakeDriver();
    const renderer = createPhaserRenderer({ driver });

    await renderer.boot({ container: createTestContainer(), width: 320, height: 240 });

    expect(() =>
      renderer.createObject({
        type: "unknown.type",
        transform: { position: { x: 0, y: 0 } }
      })
    ).toThrow("Renderer does not support render object type");
    expect(driver.objects()).toHaveLength(0);
  });

  it("exposes the driver runtime after boot", async () => {
    const driver = createFakeDriver();
    let runtime: PhaserRendererDriverRuntime | undefined;
    const renderer = createPhaserRenderer({
      driver,
      onRuntime: (nextRuntime) => {
        runtime = nextRuntime;
      }
    });

    await renderer.boot({ container: createTestContainer(), width: 320, height: 240 });

    expect(runtime).toBeDefined();
  });
});

function createNodeMap(
  children: RenderObjectDefinition["children"] = [],
  prefix: string[] = []
): Map<string, FakeRenderNode> {
  const nodes = new Map<string, FakeRenderNode>();
  for (const child of children) {
    const nodeId = child.id ?? `${child.type}-${nodes.size}`;
    const nodePath = [...prefix, nodeId].join("/");
    nodes.set(nodePath, {
      id: nodeId,
      type: child.type,
      transform: child.transform,
      props: child.props
    });

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
