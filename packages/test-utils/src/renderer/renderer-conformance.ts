import { describe, expect, it } from "vitest";
import type { RendererAdapter } from "@gamekit/renderer-core";

function createTestContainer(): HTMLElement {
  if (typeof document !== "undefined") {
    return document.createElement("div");
  }

  return {
    append() {
      // Test-only stand-in for environments without DOM globals.
    }
  } as unknown as HTMLElement;
}

export function defineRendererConformanceTests(
  name: string,
  createRenderer: () => RendererAdapter
): void {
  describe(`${name} RendererAdapter conformance`, () => {
    it("boots, exposes a view, reports capabilities, and resizes", async () => {
      const renderer = createRenderer();
      const container = createTestContainer();

      await renderer.boot({ container, width: 320, height: 240 });
      renderer.resize(640, 480);

      expect(renderer.getView()).toBeTruthy();
      expect(renderer.capabilities().objectTypes).toContain("debug.square");
      renderer.destroy();
    });

    it("creates, updates, animates, parents, and destroys render objects", async () => {
      const renderer = createRenderer();
      const container = createTestContainer();

      await renderer.boot({ container, width: 320, height: 240 });
      const parentId = renderer.createObject({
        type: "container",
        transform: { x: 0, y: 0 }
      });
      const objectId = renderer.createObject({
        type: "debug.square",
        transform: { x: 10, y: 20, width: 16, height: 16 }
      });

      expect(objectId).toBeTruthy();
      expect(() => renderer.updateObject(objectId, { transform: { x: 24, y: 32 } })).not.toThrow();
      expect(() => renderer.setParent(objectId, parentId)).not.toThrow();
      expect(() => renderer.playAnimation(objectId, "idle")).not.toThrow();
      expect(() => renderer.destroyObject(objectId)).not.toThrow();
      expect(() => renderer.updateObject(objectId, { transform: { x: 0 } })).toThrow();
      renderer.destroy();
    });

    it("fails clearly for unsupported object types", async () => {
      const renderer = createRenderer();
      const container = createTestContainer();

      await renderer.boot({ container, width: 320, height: 240 });

      expect(() =>
        renderer.createObject({
          type: "unsupported.test_object",
          transform: { x: 0, y: 0 }
        })
      ).toThrow();
      renderer.destroy();
    });
  });
}
