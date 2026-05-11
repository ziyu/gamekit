import { describe, expect, it } from "vitest";
import { createEventBus } from "@gamekit/event-bus";
import type {
  RenderObjectConfig,
  RendererCapabilities,
  RenderObjectPatch
} from "@gamekit/renderer-core";
import { defineRendererConformanceTests } from "@gamekit/test-utils";
import {
  createPhaserRenderer,
  type PhaserRendererDriver,
  type PhaserRendererDriverRuntime
} from "../src";

type FakeRenderObject = RenderObjectConfig & {
  id: string;
  animationId?: string;
};

type FakeDriver = PhaserRendererDriver & {
  objects(): FakeRenderObject[];
};

function createFakeDriver(): FakeDriver {
  const objects = new Map<string, FakeRenderObject>();
  const capabilities: RendererCapabilities = {
    objectTypes: ["debug.square", "sprite", "container"],
    supportsObjectTree: true
  };

  const runtime: PhaserRendererDriverRuntime = {
    view: { remove() {} } as unknown as HTMLElement,
    resize() {},
    destroy() {
      objects.clear();
    },
    createObject(id: string, config: RenderObjectConfig) {
      objects.set(id, { ...config, id });
    },
    updateObject(id: string, patch: RenderObjectPatch) {
      const object = objects.get(id);
      if (!object) {
        return;
      }

      objects.set(id, {
        ...object,
        ...patch,
        transform: { ...object.transform, ...patch.transform },
        props: { ...object.props, ...patch.props }
      });
    },
    setParent(id: string, parentId: string | undefined) {
      const object = objects.get(id);
      if (!object) {
        return;
      }

      const nextObject: FakeRenderObject = { ...object };
      if (parentId) {
        nextObject.parentId = parentId;
      } else {
        delete nextObject.parentId;
      }

      objects.set(id, nextObject);
    },
    destroyObject(id: string) {
      objects.delete(id);
    },
    playAnimation(id: string, animationId: string) {
      const object = objects.get(id);
      if (object) {
        objects.set(id, { ...object, animationId });
      }
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
  it("emits renderer lifecycle and object events", async () => {
    const driver = createFakeDriver();
    const eventBus = createEventBus({ clock: () => 42 });
    const events: string[] = [];
    const renderer = createPhaserRenderer({ id: "test.phaser", driver });

    eventBus.onAny((event) => events.push(event.type));
    await renderer.boot({ container: createTestContainer(), width: 320, height: 240, eventBus });
    renderer.resize(640, 480);
    const objectId = renderer.createObject({
      type: "debug.square",
      transform: { x: 10, y: 20 }
    });
    renderer.destroyObject(objectId);
    renderer.destroy();

    expect(events).toEqual([
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
        transform: { x: 0, y: 0 }
      })
    ).toThrow("Renderer does not support render object type");
    expect(driver.objects()).toHaveLength(0);
  });
});
