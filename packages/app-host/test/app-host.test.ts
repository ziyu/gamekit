import { describe, expect, it } from "vitest";
import {
  createAppHost,
  createConfiguredAppHost,
  createHeadlessHost,
  createStandardAppProfile,
  defineGameApp,
  type AppProfile,
  type AppServiceBinding
} from "@gamekit/app-host";
import { createDataRegistry } from "@gamekit/data";

describe("app host service registry", () => {
  it("registers and exposes services through the registry", () => {
    const service = { value: 1 };
    const binding: AppServiceBinding<typeof service> = {
      key: { id: "custom.service" },
      service,
      lifecycle: { id: "custom.service" }
    };
    const host = createAppHost({ id: "test-host", services: [binding] });

    expect(host.services.has(binding.key)).toBe(true);
    expect(host.services.require(binding.key)).toBe(service);
    expect(host.snapshot().services.map((entry) => entry.id)).toContain("custom.service");
  });

  it("runs lifecycle in dependency order and disposes in reverse order", async () => {
    const calls: string[] = [];
    const host = createAppHost({
      id: "lifecycle-host",
      services: [
        createLifecycleBinding("a", calls),
        createLifecycleBinding("b", calls, ["a"]),
        createLifecycleBinding("c", calls, ["b"])
      ]
    });

    await host.boot();
    await host.start();
    await host.stop();
    await host.dispose();

    expect(calls).toEqual([
      "a.boot",
      "b.boot",
      "c.boot",
      "a.start",
      "b.start",
      "c.start",
      "c.stop",
      "b.stop",
      "a.stop",
      "c.dispose",
      "b.dispose",
      "a.dispose"
    ]);
  });

  it("reports lifecycle failures with service context", async () => {
    const host = createAppHost({
      id: "failure-host",
      services: [
        {
          key: { id: "broken" },
          service: {},
          lifecycle: {
            id: "broken",
            boot() {
              throw new Error("boom");
            }
          }
        }
      ]
    });

    await expect(host.boot()).rejects.toMatchObject({
      code: "app_host.service_lifecycle_failed"
    });
    expect(host.snapshot().services[0]?.phase).toBe("failed");
    expect(host.snapshot().diagnostics.map((event) => event.type)).toContain(
      "app_host.service_failed"
    );
  });
});

describe("app host config runtime", () => {
  it("merges config sources and records final value source", () => {
    const host = createAppHost({
      id: "config-host",
      configSources: [
        { id: "framework", priority: 0, values: { renderer: { width: 320 } } },
        { id: "app", priority: 10, values: { renderer: { width: 640, height: 360 } } }
      ]
    });

    expect(host.config.require<number>("renderer.width")).toBe(640);
    expect(host.config.require<number>("renderer.height")).toBe(360);
    expect(
      host.config.snapshot().entries.find((entry) => entry.path === "renderer.width")?.source
    ).toBe("app");
  });
});

describe("headless host", () => {
  it("boots data, renderer and assets with standard service shortcuts", async () => {
    const host = createHeadlessHost({ id: "headless" });

    await host.boot();

    expect(host.services.data).toBeDefined();
    expect(host.services.assets).toBeDefined();
    expect(host.services.renderer).toBeDefined();
    expect(host.snapshot().services.map((service) => service.id)).toEqual([
      "data",
      "renderer",
      "assets"
    ]);
  });
});

describe("configured app host", () => {
  it("builds host services from an app definition and profile extensions", async () => {
    const calls: string[] = [];
    const app = defineGameApp({
      id: "configured",
      configSources: [{ id: "app", priority: 10, values: { renderer: { width: 640 } } }],
      services: [
        { id: "data", config: { packCount: 1 } },
        { id: "game", dependencies: ["data"] }
      ]
    });
    const profile: AppProfile<{ calls: string[] }> = {
      id: "test",
      configSources: [{ id: "profile", priority: 0, values: { platform: { id: "test" } } }],
      extensions: {
        data(ctx) {
          expect(ctx.requireConfig<{ packCount: number }>().packCount).toBe(1);
          return createLifecycleBinding("data", ctx.context.calls);
        },
        game(ctx) {
          return createLifecycleBinding("game", ctx.context.calls, ctx.service.dependencies);
        }
      }
    };

    const configured = createConfiguredAppHost({
      app,
      profile,
      context: { calls }
    });

    await configured.host.boot();

    expect(configured.host.config.require<number>("renderer.width")).toBe(640);
    expect(configured.host.config.require<string>("platform.id")).toBe("test");
    expect(calls).toEqual(["data.boot", "game.boot"]);
  });

  it("throws clearly when a profile is missing a service provider", () => {
    const app = defineGameApp({
      id: "missing-factory",
      services: [{ id: "renderer" }]
    });

    expect(() =>
      createConfiguredAppHost({
        app,
        profile: { id: "test" },
        context: {}
      })
    ).toThrowError(/Missing app service provider/);
  });

  it("uses the standard app profile helper for built-in service bindings", async () => {
    const app = defineGameApp({
      id: "standard-configured",
      services: [{ id: "data" }]
    });
    const profile = createStandardAppProfile({
      id: "standard",
      services: {
        data: {
          registry: createDataRegistry()
        }
      }
    });

    const configured = createConfiguredAppHost({
      app,
      profile,
      context: {}
    });

    await configured.host.boot();

    expect(configured.host.services.data).toBeDefined();
    expect(configured.host.snapshot().services.map((service) => service.id)).toEqual(["data"]);
  });
});

function createLifecycleBinding(
  id: string,
  calls: string[],
  dependencies: string[] = []
): AppServiceBinding<object> {
  return {
    key: { id },
    service: {},
    lifecycle: {
      id,
      dependencies,
      boot() {
        calls.push(`${id}.boot`);
      },
      start() {
        calls.push(`${id}.start`);
      },
      stop() {
        calls.push(`${id}.stop`);
      },
      dispose() {
        calls.push(`${id}.dispose`);
      }
    }
  };
}
