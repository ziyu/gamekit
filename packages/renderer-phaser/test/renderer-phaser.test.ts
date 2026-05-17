import { describe, expect, it } from "vitest";
import { defineRendererConformanceTests } from "@gamekit/test-utils";
import { createPhaserRenderer, type PhaserRendererRuntime } from "../src";

type FakeNativeObject = {
  id?: string;
  type: "container" | "sprite";
  textureId?: string;
  x: number;
  y: number;
  z?: number;
  displayWidth: number;
  displayHeight: number;
  destroyed: boolean;
  children: FakeNativeObject[];
  data: Map<string, unknown>;
  playedAnimations: string[];
  setData(key: string, value: unknown): void;
  getData(key: string): unknown;
  setPosition(x: number, y: number, z?: number): void;
  setRotation(rotation: number): void;
  setDisplaySize(width: number, height: number): void;
  setScale(scaleX: number, scaleY: number): void;
  setAlpha(alpha: number): void;
  setVisible(visible: boolean): void;
  setDepth(depth: number): void;
  setTint(tint: number): void;
  add(child: FakeNativeObject): void;
  play(animationId: string): void;
  destroy(): void;
};

type FakePhaserRuntime = {
  runtime: PhaserRendererRuntime;
  created: FakeNativeObject[];
  textures: Set<string>;
  resizeCalls: Array<{ width: number; height: number }>;
};

function createFakePhaserRuntime(): FakePhaserRuntime {
  const textures = new Set<string>();
  const created: FakeNativeObject[] = [];
  const resizeCalls: Array<{ width: number; height: number }> = [];
  const scene = {
    textures: {
      exists(id: string) {
        return textures.has(id);
      }
    },
    make: {
      graphics() {
        return {
          fillStyle() {},
          fillRect() {},
          lineStyle() {},
          strokeRect() {},
          generateTexture(id: string) {
            textures.add(id);
          },
          destroy() {}
        };
      }
    },
    add: {
      container(x: number, y: number) {
        const object = createNativeObject("container", x, y);
        created.push(object);
        return object;
      },
      sprite(x: number, y: number, textureId: string) {
        const object = createNativeObject("sprite", x, y, textureId);
        created.push(object);
        return object;
      }
    }
  };

  return {
    runtime: {
      view: { remove() {} } as unknown as HTMLElement,
      scene,
      resize(width, height) {
        resizeCalls.push({ width, height });
      }
    },
    created,
    textures,
    resizeCalls
  };
}

function createNativeObject(
  type: FakeNativeObject["type"],
  x: number,
  y: number,
  textureId?: string
): FakeNativeObject {
  return {
    type,
    textureId,
    x,
    y,
    displayWidth: 24,
    displayHeight: 24,
    destroyed: false,
    children: [],
    data: new Map(),
    playedAnimations: [],
    setData(key, value) {
      this.data.set(key, value);
    },
    getData(key) {
      return this.data.get(key);
    },
    setPosition(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
    setRotation(rotation) {
      this.setData("rotation", rotation);
    },
    setDisplaySize(width, height) {
      this.displayWidth = width;
      this.displayHeight = height;
    },
    setScale(scaleX, scaleY) {
      this.setData("scale", { x: scaleX, y: scaleY });
    },
    setAlpha(alpha) {
      this.setData("alpha", alpha);
    },
    setVisible(visible) {
      this.setData("visible", visible);
    },
    setDepth(depth) {
      this.setData("depth", depth);
    },
    setTint(tint) {
      this.setData("tint", tint);
    },
    add(child) {
      this.children.push(child);
    },
    play(animationId) {
      this.playedAnimations.push(animationId);
    },
    destroy() {
      this.destroyed = true;
    }
  };
}

function createTestContainer(): HTMLElement {
  return { append() {} } as unknown as HTMLElement;
}

defineRendererConformanceTests("Phaser", () =>
  createPhaserRenderer({ runtime: createFakePhaserRuntime().runtime })
);

describe("createPhaserRenderer", () => {
  it("emits renderer lifecycle and object diagnostics", async () => {
    const phaser = createFakePhaserRuntime();
    const diagnostics: string[] = [];
    const renderer = createPhaserRenderer({ id: "test.phaser", runtime: phaser.runtime });

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

    expect(phaser.resizeCalls).toEqual([{ width: 640, height: 480 }]);
    expect(diagnostics).toEqual([
      "renderer.booted",
      "renderer.resized",
      "renderer.object_created",
      "renderer.object_destroyed",
      "renderer.destroyed"
    ]);
  });

  it("rejects unsupported render object types before reaching the scene", async () => {
    const phaser = createFakePhaserRuntime();
    const renderer = createPhaserRenderer({ runtime: phaser.runtime });

    await renderer.boot({ container: createTestContainer(), width: 320, height: 240 });

    expect(() =>
      renderer.createObject({
        type: "unknown.type",
        transform: { position: { x: 0, y: 0 } }
      })
    ).toThrow("Renderer does not support render object type");
    expect(phaser.created).toHaveLength(0);
  });

  it("creates render objects against an existing Phaser scene runtime", async () => {
    const phaser = createFakePhaserRuntime();
    const renderer = createPhaserRenderer({ runtime: () => phaser.runtime });

    await renderer.boot({ container: createTestContainer(), width: 320, height: 240 });
    const objectId = renderer.createObject({
      id: "root",
      type: "container",
      children: [{ id: "body", type: "debug.square" }]
    });
    renderer.updateNode(objectId, "body", {
      transform: { position: { x: 12, y: 18 } },
      props: { tint: 0xff0000 }
    });
    renderer.command(objectId, {
      type: "animation.play",
      target: "body",
      args: { animationId: "pulse" }
    });

    const root = renderer.getObjectHandle(objectId).native as FakeNativeObject;
    const body = root.children[0];
    expect(root.type).toBe("container");
    expect(body?.x).toBe(12);
    expect(body?.y).toBe(18);
    expect(body?.getData("tint")).toBe(0xff0000);
    expect(body?.playedAnimations).toEqual(["pulse"]);
  });

  it("fails clearly when the scene runtime is unavailable", async () => {
    const renderer = createPhaserRenderer({ runtime: () => undefined });

    await expect(
      renderer.boot({ container: createTestContainer(), width: 320, height: 240 })
    ).rejects.toMatchObject({
      code: "renderer.phaser.runtime_unavailable"
    });
  });
});
