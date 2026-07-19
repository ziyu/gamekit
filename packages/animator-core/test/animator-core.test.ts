import { createAssetDataType } from "@gamekit/asset";
import { createDataRegistry, type DataPack, type DataRegistry } from "@gamekit/data";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { describe, expect, it } from "vitest";
import {
  createAnimatorDataTypes,
  createAnimatorHandle,
  createAnimatorModule,
  createAnimatorRuntime,
  createMemoryAnimationPlaybackAdapter,
  runAnimatorRuntimeConformance,
  type AnimatorTraceEntry
} from "../src";

describe("Animator data types", () => {
  it("validates marker order, graph state references, and binding fallback", () => {
    const registry = createRegistry(false);
    const validation = registry.validatePack({
      id: "animator.invalid",
      version: "1.0.0",
      entries: [
        assetEntry(),
        {
          type: "animation.clip",
          id: "clip.invalid",
          data: {
            id: "clip.invalid",
            asset: { assetId: "asset.character", type: "spritesheet" },
            durationMs: 100,
            markers: [
              { id: "late", timeMs: 90 },
              { id: "early", timeMs: 20 }
            ]
          }
        },
        {
          type: "animator.graph",
          id: "graph.invalid",
          data: {
            id: "graph.invalid",
            parameters: [],
            layers: [{ id: "base", initialState: "missing", states: [], weight: 2 }],
            oneShots: [{ id: "broken", layer: "base", clip: "idle", speed: 0 }]
          }
        },
        {
          type: "animator.binding",
          id: "binding.invalid",
          data: {
            id: "binding.invalid",
            graph: { type: "animator.graph", id: "graph.invalid" },
            clips: { idle: { type: "animation.clip", id: "clip.invalid" } },
            fallbackClip: "missing",
            phaseMappings: [{ phase: "active", layer: "base", clip: "idle", speed: 0 }]
          }
        }
      ]
    });

    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "animator.clip_invalid_marker_time" }),
        expect.objectContaining({ code: "animator.graph_missing_initial_state" }),
        expect.objectContaining({ code: "animator.graph_invalid_layer_weight" }),
        expect.objectContaining({ code: "animator.graph_invalid_one_shot_speed" }),
        expect.objectContaining({ code: "animator.binding_invalid_phase_speed" }),
        expect.objectContaining({ code: "animator.binding_invalid_fallback" })
      ])
    );
  });
});

describe("Animator runtime", () => {
  it("transitions layers from dirty parameters and batches playback", () => {
    let observerErrors = 0;
    const fixture = createFixture({
      onTrace() {
        throw new Error("observer failed");
      },
      onTraceError() {
        observerErrors += 1;
      }
    });
    fixture.runtime.bind(controller("hero"));
    fixture.runtime.update(16, 16);
    expect(fixture.adapter.frame("hero")?.layers[0]).toMatchObject({
      stateId: "idle",
      clipId: "clip.idle"
    });

    fixture.runtime.setParameter("hero", "moving", true);
    fixture.runtime.update(16, 32);

    expect(
      fixture.runtime.getController("hero")?.layers.find((layer) => layer.layerId === "base")
        ?.stateId
    ).toBe("run");
    expect(
      fixture.adapter.frame("hero")?.layers.find((layer) => layer.layerId === "base")
    ).toMatchObject({
      stateId: "run",
      clipId: "clip.run"
    });
    expect(fixture.runtime.traces()).toContainEqual(
      expect.objectContaining({ label: "animator.state_transition" })
    );
    expect(observerErrors).toBeGreaterThan(0);
  });

  it("keeps stable idle controllers from producing redundant backend writes", () => {
    const fixture = createFixture();
    fixture.runtime.bind(controller("idle"));
    fixture.runtime.update(16, 16);
    const applied = fixture.adapter.snapshot().appliedFrames;
    fixture.runtime.update(16, 32);
    fixture.runtime.update(16, 48);
    expect(fixture.adapter.snapshot().appliedFrames).toBe(applied);
  });

  it("runs bounded one-shots, queues one replay, and deduplicates markers", () => {
    const fixture = createFixture();
    const markers: string[] = [];
    fixture.runtime.dispose();
    const runtime = createAnimatorRuntime({
      dataRegistry: createRegistry(),
      adapter: fixture.adapter,
      onMarker: (marker) => markers.push(marker.markerId),
      markerHistoryLimit: 8
    });
    runtime.bind(controller("shot"));
    runtime.update(16, 16);
    runtime.trigger("shot", "fire");
    runtime.trigger("shot", "fire");
    expect(
      runtime.getController("shot")?.layers.find((layer) => layer.layerId === "action")
    ).toMatchObject({
      activeOneShotId: "fire",
      queuedOneShots: 1
    });

    runtime.update(100, 116);
    runtime.update(0, 116);
    expect(markers).toEqual(["muzzle"]);
    runtime.update(100, 216);
    expect(runtime.snapshot()).toMatchObject({ activeOneShots: 1, queuedOneShots: 0 });
    runtime.update(100, 316);
    expect(markers).toEqual(["muzzle", "muzzle"]);
  });

  it("isolates marker observers and rejects invalid gameplay clocks", () => {
    const adapter = createMemoryAnimationPlaybackAdapter();
    let markerErrors = 0;
    const runtime = createAnimatorRuntime({
      dataRegistry: createRegistry(),
      adapter,
      onMarker(marker) {
        marker.markerId = "mutated";
        throw new Error("marker observer failed");
      },
      onMarkerError(_error, marker) {
        marker.markerId = "also-mutated";
        markerErrors += 1;
      }
    });
    runtime.bind(controller("marker-observer"));
    runtime.trigger("marker-observer", "fire");
    runtime.update(100, 100);
    expect(markerErrors).toBe(1);
    expect(adapter.frame("marker-observer")?.markers[0]?.markerId).toBe("muzzle");
    expect(() =>
      runtime.syncGameplayPhase("marker-observer", {
        executionId: "invalid",
        abilityId: "ability.reload",
        phase: "active",
        startedAt: Number.NaN,
        durationMs: -1
      })
    ).toThrowError(expect.objectContaining({ code: "animator.invalid_config" }));
    runtime.dispose();
  });

  it("interrupts a one-shot only with a higher-priority action", () => {
    const fixture = createFixture();
    fixture.runtime.bind(controller("interrupt"));
    fixture.runtime.trigger("interrupt", "fire");
    fixture.runtime.trigger("interrupt", "hit");
    expect(
      fixture.runtime.getController("interrupt")?.layers.find((layer) => layer.layerId === "action")
    ).toMatchObject({ activeOneShotId: "hit", queuedOneShots: 0 });
  });

  it("rebuilds a late-joined gameplay phase at the current seek time without old markers", () => {
    const fixture = createFixture();
    fixture.runtime.bind(controller("remote"));
    fixture.runtime.update(500, 500);
    fixture.runtime.syncGameplayPhase("remote", {
      executionId: "execution.remote",
      abilityId: "ability.reload",
      phase: "active",
      startedAt: 0,
      durationMs: 2_000
    });
    fixture.runtime.update(0, 500);

    const layer = fixture.adapter
      .frame("remote")
      ?.layers.find((candidate) => candidate.layerId === "action");
    expect(layer).toMatchObject({
      kind: "gameplay-phase",
      clipId: "clip.reload",
      timeMs: 250,
      normalizedTime: 0.25,
      speed: 0.5,
      seek: true
    });
    expect(fixture.adapter.frame("remote")?.markers).toEqual([]);
  });

  it("cancels anticipated phases and ignores stale generations", () => {
    const fixture = createFixture();
    fixture.runtime.bind(controller("predicted"));
    fixture.runtime.reset("predicted", 3);
    fixture.runtime.syncGameplayPhase("predicted", {
      executionId: "stale",
      abilityId: "ability.reload",
      phase: "active",
      startedAt: 0,
      generation: 2
    });
    expect(fixture.runtime.snapshot().activeGameplayPhases).toBe(0);

    fixture.runtime.syncGameplayPhase("predicted", {
      executionId: "current",
      abilityId: "ability.reload",
      phase: "active",
      startedAt: 0,
      predicted: true,
      generation: 3
    });
    expect(fixture.runtime.snapshot().activeGameplayPhases).toBe(1);
    fixture.runtime.cancelGameplayPhase("predicted", "current");
    expect(fixture.runtime.snapshot().activeGameplayPhases).toBe(0);
  });

  it("uses the declared fallback when a graph clip alias is absent", () => {
    const fixture = createFixture();
    fixture.runtime.bind({
      controllerId: "fallback",
      bindingId: "binding.fallback",
      renderObjectId: "render.fallback"
    });
    fixture.runtime.update(16, 16);
    expect(fixture.adapter.frame("fallback")?.layers[0]?.clipId).toBe("clip.idle");
  });

  it("cleans controller and adapter retained state on dispose", () => {
    const fixture = createFixture();
    fixture.runtime.bind(controller("dispose"));
    fixture.runtime.update(16, 16);
    fixture.runtime.dispose();
    expect(fixture.runtime.snapshot()).toMatchObject({ disposed: true, controllers: [] });
    expect(fixture.adapter.snapshot()).toMatchObject({ boundControllers: 0, retainedFrames: 0 });
  });

  it("passes the reusable memory adapter conformance suite", () => {
    const report = runAnimatorRuntimeConformance(() => {
      const fixture = createFixture();
      return {
        runtime: fixture.runtime,
        adapter: fixture.adapter,
        binding: controller("conformance"),
        transitionParameter: "moving",
        oneShotId: "fire",
        dispose: fixture.dispose
      };
    });
    expect(report.checks).toHaveLength(5);
    expect(report.generation).toBe(1);
  });
});

describe("Animator GameModule", () => {
  it("binds and invalidates its handle with the module lifecycle", () => {
    const adapter = createMemoryAnimationPlaybackAdapter();
    const handle = createAnimatorHandle();
    const systems: Array<{ update(context: { delta: number; elapsed: number }): void }> = [];
    const module = createAnimatorModule({
      dataRegistry: createRegistry(),
      adapter,
      handle
    });
    const installed = module.install({
      systems: { register: (system) => systems.push(system) }
    } as unknown as GameInstallContext);
    expect(handle.isBound()).toBe(true);
    handle.bind(controller("module"));
    systems[0]?.update({ delta: 16, elapsed: 16 });
    expect(adapter.frame("module")?.layers[0]?.clipId).toBe("clip.idle");
    if (typeof installed === "function") {
      installed();
    } else {
      installed?.dispose?.();
    }
    expect(handle.isBound()).toBe(false);
    expect(() => handle.hasController("module")).toThrowError(
      expect.objectContaining({ code: "animator.handle_unbound" })
    );
  });
});

function createFixture(
  options: {
    onTrace?: (entry: AnimatorTraceEntry) => void;
    onTraceError?: (error: unknown, entry: AnimatorTraceEntry) => void;
  } = {}
) {
  const adapter = createMemoryAnimationPlaybackAdapter({ maxRetainedFrames: 32 });
  const runtime = createAnimatorRuntime({
    dataRegistry: createRegistry(),
    adapter,
    traceLimit: 100,
    markerHistoryLimit: 16,
    ...(options.onTrace === undefined ? {} : { onTrace: options.onTrace }),
    ...(options.onTraceError === undefined ? {} : { onTraceError: options.onTraceError })
  });
  return { runtime, adapter, dispose: () => runtime.dispose() };
}

function controller(controllerId: string) {
  return {
    controllerId,
    bindingId: "binding.character",
    renderObjectId: `render.${controllerId}`
  };
}

function createRegistry(withPack = true): DataRegistry {
  const registry = createDataRegistry();
  registry.registerType(createAssetDataType());
  for (const type of createAnimatorDataTypes()) {
    registry.registerType(type);
  }
  if (withPack) {
    const validation = registry.registerPack(ANIMATOR_PACK);
    if (validation.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      throw new Error(JSON.stringify(validation.diagnostics));
    }
  }
  return registry;
}

const ANIMATOR_PACK: DataPack = {
  id: "animator.test",
  version: "1.0.0",
  entries: [
    assetEntry(),
    clipEntry("clip.idle", 1_000, true),
    clipEntry("clip.run", 800, true, [
      { id: "foot-left", timeMs: 200 },
      { id: "foot-right", timeMs: 600 }
    ]),
    clipEntry("clip.fire", 200, false, [{ id: "muzzle", timeMs: 100 }]),
    clipEntry("clip.hit", 150, false),
    clipEntry("clip.reload", 1_000, false, [{ id: "magazine", timeMs: 100 }]),
    {
      type: "animator.graph",
      id: "graph.character",
      data: {
        id: "graph.character",
        parameters: [{ id: "moving", type: "boolean", default: false }],
        layers: [
          {
            id: "base",
            initialState: "idle",
            states: [
              { id: "idle", clip: "idle", loop: true },
              { id: "run", clip: "run", loop: true }
            ],
            transitions: [
              {
                from: "idle",
                to: "run",
                conditions: [{ parameter: "moving", operator: "truthy" }]
              },
              {
                from: "run",
                to: "idle",
                conditions: [{ parameter: "moving", operator: "falsy" }]
              }
            ]
          },
          {
            id: "action",
            initialState: "rest",
            priority: 10,
            states: [{ id: "rest", clip: "idle", loop: true }]
          }
        ],
        oneShots: [
          {
            id: "fire",
            layer: "action",
            clip: "fire",
            priority: 10,
            repeat: "queue-one",
            maxQueue: 1
          },
          {
            id: "hit",
            layer: "action",
            clip: "hit",
            priority: 20,
            interrupt: "always"
          }
        ]
      }
    },
    {
      type: "animator.graph",
      id: "graph.fallback",
      data: {
        id: "graph.fallback",
        parameters: [],
        layers: [{ id: "base", initialState: "idle", states: [{ id: "idle", clip: "missing" }] }]
      }
    },
    {
      type: "animator.binding",
      id: "binding.character",
      data: {
        id: "binding.character",
        graph: { type: "animator.graph", id: "graph.character" },
        clips: {
          idle: { type: "animation.clip", id: "clip.idle" },
          run: { type: "animation.clip", id: "clip.run" },
          fire: { type: "animation.clip", id: "clip.fire" },
          hit: { type: "animation.clip", id: "clip.hit" },
          reload: { type: "animation.clip", id: "clip.reload" }
        },
        fallbackClip: "idle",
        phaseMappings: [
          {
            abilityId: "ability.reload",
            phase: "active",
            layer: "action",
            clip: "reload"
          }
        ]
      }
    },
    {
      type: "animator.binding",
      id: "binding.fallback",
      data: {
        id: "binding.fallback",
        graph: { type: "animator.graph", id: "graph.fallback" },
        clips: { idle: { type: "animation.clip", id: "clip.idle" } },
        fallbackClip: "idle"
      }
    }
  ]
};

function assetEntry(): DataPack["entries"][number] {
  return {
    type: "asset.definition",
    id: "asset.character",
    data: {
      id: "asset.character",
      type: "spritesheet",
      source: { type: "url", url: "/character.png" },
      frame: { width: 32, height: 32 }
    }
  };
}

function clipEntry(
  id: string,
  durationMs: number,
  loop: boolean,
  markers: Array<{ id: string; timeMs: number }> = []
): DataPack["entries"][number] {
  return {
    type: "animation.clip",
    id,
    data: {
      id,
      asset: { assetId: "asset.character", type: "spritesheet" },
      backendClip: id,
      durationMs,
      loop,
      markers
    }
  };
}
