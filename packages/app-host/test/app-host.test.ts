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
import { createCameraController } from "@gamekit/camera-core";
import { createDataRegistry } from "@gamekit/data";
import { createEventBus } from "@gamekit/event-bus";
import { createGasDataTypes, createGasTraceStore, type GasRuntime } from "@gamekit/gas";
import { createGame } from "@gamekit/game-runtime";
import { type GameWorld } from "@gamekit/world";
import { createTcaRuleDataType } from "@gamekit/tca";

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

  it("injects standard camera, TCA, and GAS game modules into the runtime factory", async () => {
    const registry = createDataRegistry();
    registry.registerType(createTcaRuleDataType());
    for (const type of createGasDataTypes()) {
      registry.registerType(type);
    }
    registry.registerPack({
      id: "rules",
      version: "1.0.0",
      entries: [
        {
          type: "tca.rule",
          id: "rule.standard.tca",
          data: {
            id: "rule.standard.tca",
            trigger: { type: "event.type", args: { eventType: "test.trigger" } },
            actions: [{ type: "event.emit", args: { eventType: "test.derived" } }]
          }
        }
      ]
    });
    const camera = createCameraController({ viewport: { width: 320, height: 180 } });
    const initialCameraX = camera.getState().x;
    const eventBus = createEventBus({ clock: () => 1 });
    const derived: string[] = [];
    let gasRuntime: GasRuntime | undefined;
    eventBus.on("test.derived", (event) => {
      derived.push(event.type);
    });

    const app = defineGameApp({
      id: "standard-game-modules",
      services: [{ id: "data" }, { id: "game", dependencies: ["data"] }]
    });
    const profile = createStandardAppProfile({
      id: "standard",
      services: {
        data: { registry },
        game: {
          standardModules: {
            tca: {},
            gas: {
              traceStore: createGasTraceStore(),
              onRuntime(_ctx, runtime) {
                gasRuntime = runtime;
              }
            },
            camera: {
              controller: camera,
              actions: [{ actionId: "camera.pan_right", phases: ["pressed"], pan: { x: 12 } }]
            }
          },
          createRuntime(_ctx, modules) {
            expect(modules.map((module) => module.id)).toEqual([
              "gamekit.tca",
              "gamekit.gas",
              "gamekit.camera"
            ]);
            return createGame({
              modules,
              world: createMemoryWorld(),
              eventBus,
              seed: "standard"
            });
          }
        }
      }
    });

    const configured = createConfiguredAppHost({ app, profile, context: {} });

    eventBus.emit("test.trigger", {}, "test");
    eventBus.emit("input.action", { actionId: "camera.pan_right", phase: "pressed" }, "test");

    expect(derived).toEqual(["test.derived"]);
    expect(camera.getState().x).toBe(initialCameraX + 12);
    expect(gasRuntime).toBeDefined();
    expect(configured.host.services.game?.modules.map((module) => module.id)).toEqual([
      "gamekit.tca",
      "gamekit.gas",
      "gamekit.camera"
    ]);
  });

  it("smooths standard camera module renderer sync over runtime ticks", async () => {
    const camera = createCameraController({ viewport: { width: 320, height: 180 } });
    const initialCameraX = camera.getState().x;
    const eventBus = createEventBus({ clock: () => 1 });
    const syncedX: number[] = [];
    const app = defineGameApp({
      id: "smooth-camera",
      services: [{ id: "game" }]
    });
    const profile = createStandardAppProfile({
      id: "standard",
      services: {
        game: {
          standardModules: {
            camera: {
              controller: camera,
              actions: [{ actionId: "camera.pan_right", phases: ["pressed"], pan: { x: 48 } }],
              smoothing: { enabled: true, stiffness: 8 },
              sync(_ctx, _camera, _action, state) {
                syncedX.push(state.x);
              }
            }
          },
          createRuntime(_ctx, modules) {
            return createGame({
              modules,
              world: createMemoryWorld(),
              eventBus,
              seed: "standard"
            });
          }
        }
      }
    });

    const configured = createConfiguredAppHost({ app, profile, context: {} });
    const runtime = configured.host.services.game;
    if (!runtime) {
      throw new Error("Missing game runtime");
    }

    runtime.start();
    eventBus.emit("input.action", { actionId: "camera.pan_right", phase: "pressed" }, "test");
    runtime.tick(16);

    const targetX = initialCameraX + 48;
    expect(camera.getState().x).toBe(targetX);
    expect(syncedX.at(-1)).toBeGreaterThan(initialCameraX);
    expect(syncedX.at(-1)).toBeLessThan(targetX);

    for (let i = 0; i < 60; i += 1) {
      runtime.tick(16);
    }

    expect(syncedX.at(-1)).toBeCloseTo(targetX, 1);
  });

  it("tracks standard camera follow targets through a resolver", async () => {
    const camera = createCameraController({ viewport: { width: 320, height: 180 } });
    const eventBus = createEventBus({ clock: () => 1 });
    const synced: Array<{ x: number; y: number; mode: string }> = [];
    const targets = new Map<string | number, { x: number; y: number }>([
      ["hero", { x: 80, y: 48 }]
    ]);
    const app = defineGameApp({
      id: "follow-camera",
      services: [{ id: "game" }]
    });
    const profile = createStandardAppProfile({
      id: "standard",
      services: {
        game: {
          standardModules: {
            camera: {
              controller: camera,
              actions: [],
              follow: {
                resolveTarget(_ctx, targetEntity) {
                  return targets.get(targetEntity);
                }
              },
              sync(_ctx, _camera, _action, state) {
                synced.push({ x: state.x, y: state.y, mode: state.mode });
              }
            }
          },
          createRuntime(_ctx, modules) {
            return createGame({
              modules,
              world: createMemoryWorld(),
              eventBus,
              seed: "standard"
            });
          }
        }
      }
    });

    const configured = createConfiguredAppHost({ app, profile, context: {} });
    const runtime = configured.host.services.game;
    if (!runtime) {
      throw new Error("Missing game runtime");
    }

    runtime.start();
    eventBus.emit("camera.follow_entity", { entityId: "hero" }, "test");
    runtime.tick(16);

    expect(camera.getState()).toMatchObject({ mode: "follow", targetEntity: "hero", x: 80, y: 48 });
    expect(synced.at(-1)).toMatchObject({ mode: "follow", x: 80, y: 48 });

    targets.set("hero", { x: 96, y: 64 });
    runtime.tick(16);
    expect(camera.getState()).toMatchObject({ x: 96, y: 64 });

    eventBus.emit("camera.stop_follow", {}, "test");
    expect(camera.getState().mode).toBe("free");
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

function createMemoryWorld(): GameWorld {
  return {
    spawn() {
      return "entity";
    },
    despawn() {
      return undefined;
    },
    has() {
      return false;
    },
    add() {
      return undefined;
    },
    get() {
      return undefined;
    },
    set() {
      return undefined;
    },
    remove() {
      return undefined;
    },
    query() {
      return [];
    },
    count() {
      return 0;
    }
  };
}
