import { describe, expect, it } from "vitest";
import { createMultiplayerPredictedSpawnRegistry } from "../src";

describe("Multiplayer predicted spawn registry", () => {
  it("matches authority identity once and rejects stale generations", () => {
    const registry = createMultiplayerPredictedSpawnRegistry<{ x: number }, { x: number }>({
      generation: 1,
      clonePredicted: (value) => ({ ...value }),
      cloneAuthority: (value) => ({ ...value })
    });
    expect(
      registry.register({
        kind: "projectile",
        correlationId: "shot-1",
        generation: 1,
        localId: "local-shot-1",
        tick: 10,
        value: { x: 1 }
      }).status
    ).toBe("registered");

    const match = registry.match({
      kind: "projectile",
      correlationId: "shot-1",
      generation: 1,
      authorityId: "authority-shot-1",
      tick: 12,
      value: { x: 2 }
    });
    expect(match).toMatchObject({
      status: "matched",
      predicted: { localId: "local-shot-1", value: { x: 1 } },
      authority: { authorityId: "authority-shot-1", value: { x: 2 } }
    });
    expect(
      registry.match({
        kind: "projectile",
        correlationId: "shot-1",
        generation: 1,
        authorityId: "authority-shot-1",
        tick: 12,
        value: { x: 2 }
      }).status
    ).toBe("duplicate");

    registry.reset(2);
    expect(
      registry.register({
        kind: "projectile",
        correlationId: "shot-old",
        generation: 1,
        localId: "old",
        tick: 13,
        value: { x: 0 }
      }).status
    ).toBe("stale-generation");
    expect(registry.diagnostics()).toMatchObject({
      generation: 2,
      matched: 1,
      duplicates: 1,
      staleGenerations: 1,
      resets: 1,
      pending: 0
    });
  });

  it("bounds pending/resolved history, expires old spawns, and releases state", () => {
    const registry = createMultiplayerPredictedSpawnRegistry<number, number>({
      generation: "round-1",
      maxPending: 2,
      maxResolved: 2,
      maxAgeTicks: 3
    });
    for (let index = 0; index < 3; index += 1) {
      registry.register({
        kind: "projectile",
        correlationId: `shot-${index}`,
        generation: "round-1",
        localId: `local-${index}`,
        tick: index,
        value: index
      });
    }
    expect(registry.pending().map((entry) => entry.localId)).toEqual(["local-1", "local-2"]);
    expect(registry.diagnostics()).toMatchObject({ evicted: 1, pending: 2, resolved: 1 });

    expect(registry.expire(6).map((entry) => entry.localId)).toEqual(["local-1", "local-2"]);
    expect(registry.diagnostics()).toMatchObject({ expired: 2, pending: 0, resolved: 2 });
    registry.dispose();
    expect(() => registry.pending()).toThrow("disposed");
  });

  it("compacts matched pending-order slots under sustained churn", () => {
    const registry = createMultiplayerPredictedSpawnRegistry<number, number>({
      generation: 1,
      maxPending: 8,
      maxResolved: 32
    });
    for (let index = 0; index < 1_000; index += 1) {
      const identity = {
        kind: "projectile",
        correlationId: `shot-${index}`,
        generation: 1
      } as const;
      registry.register({
        ...identity,
        localId: `local-${index}`,
        tick: index,
        value: index
      });
      registry.match({
        ...identity,
        authorityId: `authority-${index}`,
        tick: index,
        value: index
      });
    }
    expect(registry.diagnostics()).toMatchObject({
      pending: 0,
      resolved: 32
    });
    expect(registry.diagnostics().pendingOrderEntries).toBeLessThanOrEqual(16);
    expect(registry.diagnostics().resolvedOrderEntries).toBe(32);
    registry.dispose();
  });

  it("returns rejected payloads so callers can retract dependent prediction", () => {
    const registry = createMultiplayerPredictedSpawnRegistry<{ effect: string }, never>({
      generation: 4,
      clonePredicted: (value) => ({ ...value })
    });
    registry.register({
      kind: "projectile",
      correlationId: "shot-denied",
      generation: 4,
      localId: "local-denied",
      tick: 20,
      value: { effect: "muzzle" }
    });
    expect(
      registry.reject(
        { kind: "projectile", correlationId: "shot-denied", generation: 4 },
        "ammo-empty"
      )
    ).toMatchObject({
      status: "rejected",
      reason: "ammo-empty",
      predicted: { localId: "local-denied", value: { effect: "muzzle" } }
    });
  });
});
