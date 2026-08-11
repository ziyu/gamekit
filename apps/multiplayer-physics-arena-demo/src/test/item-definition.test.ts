import { describe, expect, it } from "vitest";

import { compileArenaContent, createArenaDataRegistry } from "../content/registry";
import {
  compileArenaItemDefinitions,
  compileArenaStageItemManifest
} from "../items/item-definition";

describe("Knockout Arena item definition compiler", () => {
  it("compiles the stage pool and stable item spawn manifest", () => {
    const content = compileArenaContent(createArenaDataRegistry());
    const manifest = compileArenaStageItemManifest(content.stages[1]!);

    expect(manifest.stageId).toBe("stage.scrap-yard");
    expect(manifest.definitions.map((definition) => definition.id)).toEqual([
      "item.foam-ball",
      "item.energy-block",
      "item.blast-orb",
      "item.foam-hammer"
    ]);
    expect(manifest.spawns).toEqual([
      expect.objectContaining({ id: "item.0", definitionId: "item.foam-ball" }),
      expect.objectContaining({ id: "item.1", definitionId: "item.energy-block" }),
      expect.objectContaining({ id: "item.2", definitionId: "item.blast-orb" }),
      expect.objectContaining({ id: "item.3", definitionId: "item.foam-hammer" })
    ]);
    expect(manifest.definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "item.foam-ball",
          activeState: "released",
          networkStrategy: "predicted-entity"
        }),
        expect.objectContaining({
          id: "item.foam-hammer",
          activeState: "melee-active",
          networkStrategy: "authority-only"
        })
      ])
    );
  });

  it("rejects duplicate, invalid, and over-capacity definitions", () => {
    const item = {
      id: "item.fixture",
      kind: "throwable" as const,
      physics: {
        shape: { type: "sphere" as const, radius: 0.5 },
        mass: 1,
        friction: 0.5,
        restitution: 0.5,
        continuousCollisionDetection: true,
        maxLinearSpeed: 10,
        lifetimeTicks: 120,
        maxBounces: 2
      },
      carry: {
        socket: "hand.primary",
        speedMultiplier: 0.8,
        jumpMultiplier: 1,
        dropPolicy: "drop" as const
      },
      action: {
        mode: "throw-contact" as const,
        windupTicks: 1,
        maxChargeTicks: 10,
        activeTicks: 120,
        cooldownTicks: 2,
        launchSpeed: 10,
        baseImpulse: 4,
        areaRadius: 0
      },
      respawn: { mode: "timed" as const, ticks: 3 },
      presentationId: "presentation.fixture",
      networkStrategy: "predicted-entity" as const
    };

    expect(() => compileArenaItemDefinitions([item, item])).toThrow("unique ids");
    expect(() =>
      compileArenaItemDefinitions([{ ...item, carry: { ...item.carry, speedMultiplier: 1.1 } }])
    ).toThrow("Invalid Arena item definition");
    expect(() => compileArenaItemDefinitions([item], { maxDefinitions: 0 })).toThrow(
      "maxDefinitions must be a positive integer"
    );
  });
});
