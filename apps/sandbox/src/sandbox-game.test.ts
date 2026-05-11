import { describe, expect, it } from "vitest";
import { createMemoryRenderer } from "@gamekit/test-utils";
import { createSandboxDataRegistry, createSandboxRuntime } from "./sandbox-game";

describe("sandbox runtime", () => {
  it("moves entities deterministically for a fixed seed", () => {
    const a = createSandboxRuntime("fixed-seed");
    const b = createSandboxRuntime("fixed-seed");

    a.runtime.start();
    b.runtime.start();

    for (let i = 0; i < 5; i += 1) {
      a.runtime.tick(100);
      b.runtime.tick(100);
    }

    expect(a.snapshot().entities).toEqual(b.snapshot().entities);
  });

  it("records runtime and module events", () => {
    const sandbox = createSandboxRuntime("event-seed");
    sandbox.runtime.start();

    expect(sandbox.snapshot().events.map((event) => event.type)).toContain(
      "runtime.module_installed"
    );
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain(
      "sandbox.entity_spawned"
    );
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain("runtime.started");
  });

  it("syncs renderable entities to the renderer", async () => {
    const renderer = createMemoryRenderer();
    const sandbox = createSandboxRuntime({
      seed: "render-seed",
      renderer,
      renderSize: { width: 100, height: 100 }
    });

    await renderer.boot({
      container: { append() {} } as unknown as HTMLElement,
      width: 100,
      height: 100,
      onDiagnostic: (event) => {
        sandbox.runtime.eventBus.emit(event.type, event.payload, event.source);
      }
    });
    sandbox.runtime.start();
    sandbox.runtime.tick(16);
    sandbox.runtime.tick(16);

    expect(renderer.objects()).toHaveLength(5);
    expect(new Set(renderer.objects().map((object) => object.id)).size).toBe(5);
    expect(renderer.objects()[0]?.type).toBe("container");
    expect(renderer.objects()[0]?.nodes.has("marker/ring")).toBe(true);
    expect(renderer.objects()[0]?.nodes.get("aura")?.transform?.scale?.x).not.toBe(1);
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain(
      "sandbox.render_object_linked"
    );
  });

  it("exposes sandbox data documents and asset references", () => {
    const registry = createSandboxDataRegistry();
    const snapshot = registry.snapshot();
    const asset = registry.getValue<{ source: { url?: string } }>(
      "asset",
      "asset.sandbox.entity_square"
    );

    expect(snapshot.kinds).toContain("asset");
    expect(snapshot.kinds).toContain("renderObject");
    expect(snapshot.kinds).toContain("renderRig");
    expect(snapshot.kinds).toContain("actor");
    expect(snapshot.kinds).toContain("ability");
    expect(snapshot.kinds).toContain("biome");
    expect(snapshot.kinds).toContain("spawnProfile");
    expect(snapshot.documents).toHaveLength(9);
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: { kind: "renderObject", id: "render.sandbox.entity" },
        to: { kind: "asset", id: "asset.sandbox.entity_square" },
        path: "children.body"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: { kind: "actor", id: "actor.sandbox.scout_swarm" },
        to: { kind: "renderRig", id: "renderRig.sandbox.scout_swarm" },
        path: "renderRigId"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: { kind: "spawnProfile", id: "spawn.sandbox.scout_patrol" },
        to: { kind: "biome", id: "biome.sandbox.neon_ruins" },
        path: "biomeId"
      })
    );
    expect(asset.source.url).toContain("fill='white'");
  });
});
