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

  it("runs sandbox TCA rules from data pack events", () => {
    const sandbox = createSandboxRuntime("tca-seed");

    sandbox.runtime.eventBus.emit(
      "input.action",
      { actionId: "game.confirm", contextId: "gameplay", phase: "pressed", value: 1 },
      "test"
    );

    const trace = sandbox
      .snapshot()
      .tcaTraces.find((entry) => entry.ruleId === "rule.sandbox.confirm_signal");

    expect(sandbox.snapshot().tcaRuleCount).toBe(8);
    expect(trace).toMatchObject({
      ruleId: "rule.sandbox.confirm_signal",
      status: "passed",
      actions: [
        { type: "sandbox.log", status: "executed" },
        { type: "event.emit", status: "executed" }
      ]
    });
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain("sandbox.tca_log");
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain("sandbox.tca_confirmed");
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain("gas.ability_activated");
    expect(
      sandbox
        .snapshot()
        .gasActors.find((actor) => actor.actor.actorId === "gas.actor.sandbox.scout.0")?.tags.values
    ).toContain("state.overcharged");
    expect(sandbox.snapshot().timeline.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["input", "event", "tca", "gas"])
    );
  });

  it("runs GAS ability and effect state through the sandbox TCA chain", () => {
    const sandbox = createSandboxRuntime("gas-seed");

    sandbox.runtime.start();
    for (let i = 0; i < 60; i += 1) {
      sandbox.runtime.tick(16);
    }

    const source = sandbox
      .snapshot()
      .gasActors.find((actor) => actor.actor.actorId === "gas.actor.sandbox.scout.0");
    const target = sandbox
      .snapshot()
      .gasActors.find((actor) => actor.actor.actorId === "gas.actor.sandbox.scout.1");

    expect(source?.attributes.current.energy).toBeLessThan(40);
    expect(target?.attributes.current.health).toBeLessThan(100);
    expect(sandbox.snapshot().gasTraces.map((trace) => trace.type)).toContain("ability.activated");
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain("gas.cue");
  });

  it("exposes selected actor world, render, and GAS state in snapshots", async () => {
    const renderer = createMemoryRenderer();
    const sandbox = createSandboxRuntime({
      seed: "selected-seed",
      renderer,
      renderSize: { width: 100, height: 100 }
    });

    await renderer.boot({
      container: { append() {} } as unknown as HTMLElement,
      width: 100,
      height: 100
    });
    sandbox.runtime.start();
    sandbox.runtime.tick(16);

    const snapshot = sandbox.snapshot({ selectedActorId: "gas.actor.sandbox.scout.2" });
    const selectedEntity = snapshot.entities.find(
      (entity) => entity.actorId === snapshot.selected?.actorId
    );
    const selectedGasActor = snapshot.gasActors.find(
      (actor) => actor.actor.actorId === snapshot.selected?.actorId
    );

    expect(snapshot.selected).toMatchObject({
      actorId: "gas.actor.sandbox.scout.2",
      entityId: selectedEntity?.id
    });
    expect(selectedEntity?.renderObjectId).toBeDefined();
    expect(selectedGasActor?.attributes.current.health).toBe(100);
    expect(selectedGasActor?.tags.values).toContain("team.scout");
  });

  it("can create a snapshot without a default selected actor", () => {
    const sandbox = createSandboxRuntime("cleared-selection-seed");

    sandbox.runtime.start();
    sandbox.runtime.tick(16);

    expect(sandbox.snapshot().selected?.actorId).toBeDefined();
    expect(sandbox.snapshot({ defaultSelection: false }).selected).toBeUndefined();
  });

  it("updates objective and timeline when confirm and motion rules drive GAS", () => {
    const sandbox = createSandboxRuntime("objective-seed");

    sandbox.runtime.start();
    sandbox.runtime.eventBus.emit(
      "input.action",
      { actionId: "game.confirm", contextId: "gameplay", phase: "pressed", value: 1 },
      "test"
    );
    for (let i = 0; i < 60; i += 1) {
      sandbox.runtime.tick(16);
    }

    const snapshot = sandbox.snapshot({ selectedActorId: "gas.actor.sandbox.scout.0" });
    const source = snapshot.gasActors.find(
      (actor) => actor.actor.actorId === "gas.actor.sandbox.scout.0"
    );
    const target = snapshot.gasActors.find(
      (actor) => actor.actor.actorId === "gas.actor.sandbox.scout.1"
    );

    expect(snapshot.objective.id).toBe("signal-outpost");
    expect(snapshot.objective.progress).toBeGreaterThan(0);
    expect(source?.tags.values).toContain("state.overcharged");
    expect(target?.attributes.current.health).toBeLessThan(100);
    expect(snapshot.timeline.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["input", "tca", "gas"])
    );
    expect(snapshot.timeline).toEqual(
      [...snapshot.timeline].sort(
        (left, right) => left.time - right.time || left.id.localeCompare(right.id)
      )
    );
  });

  it("runs dispatcher work with route, battery, station, and objective state", () => {
    const sandbox = createSandboxRuntime("dispatcher-seed");

    sandbox.runtime.start();
    for (let i = 0; i < 24; i += 1) {
      sandbox.runtime.tick(100);
    }

    const snapshot = sandbox.snapshot();
    const scouts = snapshot.entities.filter((entity) => entity.role === "scout");
    const core = snapshot.entities.find((entity) => entity.role === "command-core");

    expect(scouts.some((scout) => scout.targetObjectId)).toBe(true);
    expect(scouts.some((scout) => (scout.routeProgress ?? 0) > 0)).toBe(true);
    expect(scouts.some((scout) => (scout.battery ?? 100) < 100)).toBe(true);
    expect(core?.station?.zone).toBe("core");
    expect(core?.objective?.phaseId).toBe("objective.sandbox.phase.bootstrap");
    expect(snapshot.objective.progress).toBeGreaterThan(0);
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

    expect(renderer.objects()).toHaveLength(18);
    expect(new Set(renderer.objects().map((object) => object.id)).size).toBe(18);
    expect(renderer.objects().filter((object) => object.type === "container").length).toBe(12);
    expect(renderer.objects().filter((object) => object.type === "sprite").length).toBe(6);
    expect(renderer.objects()[0]?.nodes.has("charge/fill")).toBe(true);
    expect(renderer.objects()[0]?.nodes.get("outer")?.props?.tint).toBeDefined();
    expect(sandbox.snapshot().entities.map((entity) => entity.role)).toEqual(
      expect.arrayContaining([
        "command-core",
        "relay-tower",
        "scout",
        "data-node",
        "asset-fabricator",
        "interference-node",
        "signal-link"
      ])
    );
    expect(sandbox.snapshot().events.map((event) => event.type)).toContain(
      "sandbox.render_object_linked"
    );
  });

  it("exposes sandbox data documents and asset references", () => {
    const registry = createSandboxDataRegistry();
    const snapshot = registry.snapshot();
    const asset = registry.getValue<{ source: { url?: string } }>(
      "asset.definition",
      "asset.sandbox.entity_square"
    );

    expect(snapshot.types).toContain("asset.definition");
    expect(snapshot.types).toContain("render.object");
    expect(snapshot.types).toContain("sandbox.renderRig");
    expect(snapshot.types).toContain("sandbox.actor");
    expect(snapshot.types).toContain("sandbox.ability");
    expect(snapshot.types).toContain("gas.actor");
    expect(snapshot.types).toContain("gas.ability");
    expect(snapshot.types).toContain("gas.effect");
    expect(snapshot.types).toContain("sandbox.biome");
    expect(snapshot.types).toContain("sandbox.spawnProfile");
    expect(snapshot.types).toContain("sandbox.sceneObject");
    expect(snapshot.types).toContain("sandbox.station");
    expect(snapshot.types).toContain("sandbox.productionRecipe");
    expect(snapshot.types).toContain("sandbox.objectivePhase");
    expect(snapshot.types).toContain("sandbox.threatProfile");
    expect(snapshot.types).toContain("sandbox.outpostRoute");
    expect(snapshot.types).toContain("sandbox.sceneLayout");
    expect(snapshot.types).toContain("tca.rule");
    expect(snapshot.documents.length).toBeGreaterThanOrEqual(78);
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({ type: "render.object", id: "render.sandbox.entity" }),
        to: expect.objectContaining({
          type: "asset.definition",
          id: "asset.sandbox.entity_square"
        }),
        path: "children.body"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({ type: "sandbox.actor", id: "actor.sandbox.scout_swarm" }),
        to: expect.objectContaining({
          type: "sandbox.renderRig",
          id: "renderRig.sandbox.scout_swarm"
        }),
        path: "renderRigId"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({
          type: "sandbox.spawnProfile",
          id: "spawn.sandbox.scout_patrol"
        }),
        to: expect.objectContaining({ type: "sandbox.biome", id: "biome.sandbox.neon_ruins" }),
        path: "biomeId"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({
          type: "sandbox.sceneObject",
          id: "scene.sandbox.command_core"
        }),
        to: expect.objectContaining({ type: "render.object", id: "render.sandbox.command_core" }),
        path: "renderObjectId"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({
          type: "sandbox.sceneLayout",
          id: "sceneLayout.sandbox.signal_outpost"
        }),
        to: expect.objectContaining({
          type: "sandbox.sceneObject",
          id: "scene.sandbox.relay_north"
        }),
        path: "objectIds[2]"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({
          type: "sandbox.sceneObject",
          id: "scene.sandbox.command_core"
        }),
        to: expect.objectContaining({
          type: "sandbox.station",
          id: "station.sandbox.command_core"
        }),
        path: "stationDefinitionId"
      })
    );
    expect(snapshot.references).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({
          type: "sandbox.sceneLayout",
          id: "sceneLayout.sandbox.signal_outpost"
        }),
        to: expect.objectContaining({ type: "sandbox.outpostRoute", id: "route.relay_north.core" }),
        path: "links[1].routeId"
      })
    );
    expect(asset.source.url).toContain("fill='white'");
  });

  it("summarizes content and assets through the sandbox snapshot", () => {
    const registry = createSandboxDataRegistry();
    const sandbox = createSandboxRuntime({
      seed: "content-seed",
      dataRegistry: registry,
      assetSummary: () => ({
        assetsLoaded: 2,
        assetsFailed: 1
      })
    });
    const registrySnapshot = registry.snapshot();
    const snapshot = sandbox.snapshot();

    expect(snapshot.contentSummary).toEqual({
      packs: registrySnapshot.packs.length,
      types: registrySnapshot.types.length,
      documents: registrySnapshot.documents.length,
      references: registrySnapshot.references.length,
      assetsLoaded: 2,
      assetsFailed: 1
    });
    expect(snapshot.moduleSummary.map((entry) => entry.id)).toEqual([
      "runtime",
      "world",
      "renderer",
      "rules"
    ]);
  });
});
