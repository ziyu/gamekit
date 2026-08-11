import type { ThreeRendererNative } from "@gamekit/driver-three";
import type { PhysicsPredictionIslandStateSnapshot } from "@gamekit/physics-core";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createArenaVisual } from "../client/arena-visual";
import { createArenaDefinitionMap } from "../shared/arena-definition";

describe("Knockout Circuit presentation", () => {
  it("renders a third-person runner scene instead of the driver debug camera", () => {
    const render = vi.fn();
    const native = fakeNative(render);
    const visual = createArenaVisual(native, createArenaDefinitionMap());

    visual.update(arenaState(), "player.0", 1000 / 60);

    const circuit = native.scene.getObjectByName("knockout-circuit.root");
    const player = native.scene.getObjectByName("knockout.player.0");
    const localRing = native.scene.getObjectByName("player.0.local-ring");
    expect(circuit).toBeInstanceOf(THREE.Group);
    expect(player).toBeInstanceOf(THREE.Group);
    expect(localRing?.visible).toBe(true);
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[1]).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(render.mock.calls[0]?.[1]).not.toBe(native.camera);

    visual.destroy();
    expect(native.scene.getObjectByName("knockout-circuit.root")).toBeUndefined();
  });

  it("bounds speculative effect presentation and removes expired particles", () => {
    const native = fakeNative(vi.fn());
    const visual = createArenaVisual(native, createArenaDefinitionMap());
    visual.update(arenaState(), "player.0", 16);

    visual.effect({
      effectId: "jump:player.0:7",
      kind: "jump",
      phase: "anticipate",
      tick: 12
    });
    expect(native.scene.getObjectByName("knockout.fx.jump.anticipate")).toBeDefined();

    for (let index = 0; index < 14; index += 1) visual.update(arenaState(), "player.0", 50);
    expect(native.scene.getObjectByName("knockout.fx.jump.anticipate")).toBeUndefined();
    visual.destroy();
  });

  it("retracts cancelled anticipation before it can linger on screen", () => {
    const native = fakeNative(vi.fn());
    const visual = createArenaVisual(native, createArenaDefinitionMap());
    visual.update(arenaState(), "player.0", 16);

    const event = {
      effectId: "contact:player.0:hazard.sweeper:12",
      kind: "contact" as const,
      tick: 12
    };
    visual.effect({ ...event, phase: "anticipate" });
    expect(native.scene.getObjectByName("knockout.fx.contact.anticipate")).toBeDefined();
    visual.effect({ ...event, phase: "cancel" });
    expect(native.scene.getObjectByName("knockout.fx.contact.anticipate")).toBeUndefined();
    expect(native.scene.getObjectByName("knockout.fx.contact.cancel")).toBeUndefined();
    visual.destroy();
  });
});

function fakeNative(render: ReturnType<typeof vi.fn>): ThreeRendererNative {
  const renderer = {
    domElement: { clientWidth: 1280, clientHeight: 720, width: 1280, height: 720 },
    shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    outputColorSpace: THREE.LinearSRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    render
  } as unknown as THREE.WebGLRenderer;
  return {
    scene: new THREE.Scene(),
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1),
    renderer,
    render: vi.fn()
  } as unknown as ThreeRendererNative;
}

function arenaState(): PhysicsPredictionIslandStateSnapshot {
  return {
    generation: "round:1",
    tick: 12,
    members: [
      {
        id: "player.0",
        body: {
          id: "player.0",
          kind: "dynamic",
          position: { x: -1.2, y: 1.3, z: 4.1 },
          linearVelocity: { x: 1.5, y: 0, z: -4.5 },
          sleeping: false
        }
      },
      {
        id: "bot.0",
        body: {
          id: "bot.0",
          kind: "dynamic",
          position: { x: 1.2, y: 1.3, z: 3.7 },
          linearVelocity: { x: 0, y: 0, z: -3.5 },
          sleeping: false
        }
      },
      {
        id: "hazard.sweeper",
        body: {
          id: "hazard.sweeper",
          kind: "kinematic",
          position: { x: 0, y: 1, z: -1.5 },
          rotation: { x: 0, y: 0.35, z: 0 },
          linearVelocity: { x: 0, y: 0, z: 0 },
          sleeping: false
        }
      }
    ]
  };
}
