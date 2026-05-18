import { describe, expect, it } from "vitest";
import { createSandboxCameraController, applySandboxCameraAction } from "./camera";
import { SANDBOX_RENDER_SIZE } from "./sandbox-game";
import {
  runBootChain,
  runConfirmChain,
  runIdleAutomationChain,
  runSelectionChain,
  runThreatChain
} from "./test/long-chain-scenarios";
import { createSandboxInputTestHarness, createSandboxTestHarness } from "./test/sandbox-harness";
import {
  expectDataReference,
  expectEntityWithObjectId,
  expectEntityWithRole,
  expectEveryDataReferenceResolves,
  expectGasActor,
  expectRendererLinked,
  expectSceneRoles,
  expectTimelineKinds,
  expectTimelineSorted
} from "./test/snapshot-assertions";

describe("sandbox long-chain integration", () => {
  it("boots Tiny Camp across data, runtime, world, renderer, and diagnostics", async () => {
    const harness = createSandboxTestHarness({ seed: "long-chain-boot" });

    const { snapshot } = await runBootChain(harness);

    expect(snapshot.running).toBe(true);
    expect(snapshot.entityCount).toBe(19);
    expect(snapshot.moduleSummary.map((entry) => entry.id)).toEqual([
      "runtime",
      "world",
      "renderer",
      "rules"
    ]);
    expectSceneRoles(snapshot, [
      "campfire",
      "resource-node",
      "worker",
      "storage",
      "workshop",
      "tower",
      "monster",
      "road"
    ]);
    const monster = expectEntityWithObjectId(snapshot, "scene.sandbox.monster_den");
    expect(monster).toMatchObject({
      role: "monster",
      x: expect.any(Number),
      y: expect.any(Number)
    });
    expect(monster.x).toBeGreaterThan(80);
    expect(monster.y).toBeLessThan(72);
    const monsterRender = harness.dataRegistry.getValue<{
      children?: Array<{ id?: string; alpha?: number; props?: Record<string, unknown> }>;
    }>("render.object", "render.sandbox.monster");
    const monsterField = monsterRender.children?.find((child) => child.id === "field");
    expect(monsterField?.alpha).toBeGreaterThanOrEqual(0.45);
    expect(monsterField?.props?.width).toBeGreaterThanOrEqual(120);
    expectRendererLinked(harness.renderer, snapshot, 19);
    expectEveryDataReferenceResolves(harness.dataRegistry);
    expectDataReference(
      harness.dataRegistry,
      { type: "sandbox.sceneLayout", id: "sceneLayout.sandbox.tiny_camp" },
      { type: "sandbox.sceneObject", id: "scene.sandbox.campfire" },
      "objectIds[0]"
    );
    expectDataReference(
      harness.dataRegistry,
      { type: "sandbox.sceneObject", id: "scene.sandbox.campfire" },
      { type: "render.object", id: "render.sandbox.campfire" },
      "renderObjectId"
    );
    expectDataReference(
      harness.dataRegistry,
      { type: "sandbox.sceneObject", id: "scene.sandbox.campfire" },
      { type: "gas.actor", id: "gas.actor.sandbox.building" },
      "gasActorDefinitionId"
    );
    expect(snapshot.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "renderer.booted",
        "runtime.started",
        "sandbox.entity_spawned",
        "sandbox.render_object_linked"
      ])
    );
    expectTimelineKinds(snapshot, ["runtime", "renderer"]);
    expectTimelineSorted(snapshot);
  });

  it("keeps idle automation deterministic while workers, routes, objective, and renderer move", async () => {
    const first = createSandboxTestHarness({ seed: "long-chain-idle" });
    const second = createSandboxTestHarness({ seed: "long-chain-idle" });

    await first.bootRenderer();
    await second.bootRenderer();

    const firstResult = runIdleAutomationChain(first, 36, 100);
    const secondResult = runIdleAutomationChain(second, 36, 100);

    expect(firstResult.after.entities).toEqual(secondResult.after.entities);
    expect(firstResult.after.objective.progress).toBeGreaterThan(
      firstResult.before.objective.progress
    );
    expect(firstResult.after.entities.some((entity) => (entity.routeProgress ?? 0) > 0)).toBe(true);
    expect(firstResult.after.entities.some((entity) => (entity.battery ?? 100) < 100)).toBe(true);
    expect(firstResult.after.entities.some((entity) => entity.link?.status === "moving")).toBe(
      true
    );
    const workerRoutes = firstResult.after.entities
      .filter((entity) => entity.role === "worker")
      .map((entity) => `${entity.sourceObjectId ?? "none"}->${entity.targetObjectId ?? "none"}`);
    expect(new Set(workerRoutes).size).toBeGreaterThanOrEqual(3);

    const beforeTransforms = first.renderer.objects().map((object) => ({
      id: object.id,
      position: object.transform?.position
    }));
    first.tickMany(12, 100);
    const afterTransforms = first.renderer.objects().map((object) => ({
      id: object.id,
      position: object.transform?.position
    }));

    expect(afterTransforms).not.toEqual(beforeTransforms);
  });

  it("routes confirm through input, TCA, GAS, cues, objective state, and timeline", () => {
    const harness = createSandboxTestHarness({ seed: "long-chain-confirm" });

    const result = runConfirmChain(harness);

    expect(result.after.objective.progress).toBeGreaterThanOrEqual(
      result.before.objective.progress
    );
    expectTimelineKinds(result.after, ["input", "event", "tca", "gas"]);
    expectTimelineSorted(result.after);
    expect(result.after.tcaTraces).toContainEqual(
      expect.objectContaining({
        ruleId: "rule.sandbox.confirm_boost",
        status: "passed"
      })
    );
    expect(result.after.gasTraces.map((trace) => trace.type)).toContain("ability.activated");
    expect(result.after.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "input.action",
        "sandbox.tca_confirmed",
        "gas.ability_activated",
        "gas.cue"
      ])
    );
    expect(expectGasActor(result.after, "gas.actor.sandbox.worker.0").tags.values).toContain(
      "state.overcharged"
    );
  });

  it("propagates monster pressure through world damage, GAS effects, and event visibility", () => {
    const harness = createSandboxTestHarness({ seed: "long-chain-threat" });

    const result = runThreatChain(harness);
    const beforeTower = expectEntityWithObjectId(result.before, "scene.sandbox.watchtower");
    const afterTower = expectEntityWithObjectId(result.after, "scene.sandbox.watchtower");
    const monster = expectEntityWithRole(result.after, "monster");

    expect(afterTower.building?.health).toBeLessThan(beforeTower.building?.health ?? 100);
    expect(afterTower.building?.mode).toBe("damaged");
    expect(monster.threatIntensity).toBeGreaterThan(0);
    expect(result.after.events.map((event) => event.type)).toContain("sandbox.monster_attack");
    expect(result.after.gasTraces).toContainEqual(
      expect.objectContaining({
        type: "effect.applied",
        effectId: "gas.effect.sandbox.monster_pressure"
      })
    );
    expectTimelineKinds(result.after, ["event", "gas"]);
  });

  it("keeps scene selection, blank clicks, camera motion, and input scopes coherent", async () => {
    const harness = createSandboxTestHarness({ seed: "long-chain-selection" });
    const camera = createSandboxCameraController(SANDBOX_RENDER_SIZE);

    await harness.bootRenderer();
    harness.start();
    harness.tickMany(2);

    const snapshot = harness.snapshot({ defaultSelection: false });
    const campfire = expectEntityWithRole(snapshot, "campfire");
    const selection = runSelectionChain(snapshot, campfire);

    expect(selection.target).toMatchObject({
      entityId: campfire.id,
      actorId: campfire.actorId
    });
    expect(selection.blankTarget).toBeUndefined();

    const initialCamera = camera.getState();
    applySandboxCameraAction(camera, {
      actionId: "camera.pan_right",
      input: { id: "pan", device: "keyboard", phase: "held", timestamp: 0 }
    });
    expect(camera.getState().x).toBeGreaterThan(initialCamera.x);

    const inputHarness = createSandboxInputTestHarness();
    inputHarness.router.handle({
      id: "key-ui",
      device: "keyboard",
      code: "KeyW",
      phase: "held",
      scope: "ui",
      timestamp: 1
    });
    expect(inputHarness.actions).toHaveLength(0);

    inputHarness.router.handle({
      id: "key-game",
      device: "keyboard",
      code: "KeyW",
      phase: "held",
      scope: "game",
      timestamp: 2
    });
    expect(inputHarness.actions).toContainEqual(
      expect.objectContaining({
        actionId: "camera.pan_up",
        contextId: "camera",
        phase: "held"
      })
    );
  });
});
