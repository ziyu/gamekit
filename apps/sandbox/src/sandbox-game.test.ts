import { describe, expect, it } from "vitest";
import { createMemoryRenderer } from "@gamekit/test-utils";
import { createSandboxRuntime } from "./sandbox-game";

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
      eventBus: sandbox.runtime.eventBus
    });
    sandbox.runtime.start();
    sandbox.runtime.tick(16);

    expect(renderer.objects()).toHaveLength(5);
    expect(new Set(renderer.objects().map((object) => object.id)).size).toBe(5);
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain(
      "sandbox.render_object_linked"
    );
  });
});
