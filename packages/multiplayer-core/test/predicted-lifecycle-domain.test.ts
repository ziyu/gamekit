import { describe, expect, it } from "vitest";
import {
  createMultiplayerPredictedLifecycleDomain,
  type MultiplayerPredictedLifecycleBinding,
  type MultiplayerPredictedLifecycleLocalIdentity
} from "../src";

describe("Multiplayer predicted lifecycle domain", () => {
  it("owns generation, authority time, spawn matching, and identity lookup", () => {
    const domain = createMultiplayerPredictedLifecycleDomain<{ x: number }, { x: number }>({
      kind: "projectile",
      generation: "round-1",
      stepMs: 50
    });
    expect(
      domain.register({
        correlationId: "shot-1",
        localId: "local-shot-1",
        tick: 20,
        value: { x: 1 }
      }).status
    ).toBe("registered");

    const sync = domain.sync({
      generation: "round-1",
      authorityTime: 1_000,
      localTime: 100,
      authoritySpawns: [
        {
          correlationId: "shot-1",
          authorityId: "authority-shot-1",
          tick: 22,
          value: { x: 2 }
        }
      ]
    });
    expect(sync).toMatchObject({
      generationChanged: false,
      timeline: { authorityTick: 20 },
      matches: [
        {
          binding: {
            correlationId: "shot-1",
            localId: "local-shot-1",
            authorityId: "authority-shot-1"
          },
          match: { status: "matched" }
        }
      ]
    });
    expect(domain.binding("shot-1")).toMatchObject({ authorityId: "authority-shot-1" });
    expect(domain.binding("local-shot-1")).toEqual(domain.binding("authority-shot-1"));
    expect(domain.correlationId("authority-shot-1")).toBe("shot-1");
    expect(domain.hasLocalPrediction("authority-shot-1")).toBe(true);
    expect(domain.authorityTick(150)).toBe(21);
    expect(domain.authoritySampleTick(175)).toBe(21.5);
    expect(domain.diagnostics()).toMatchObject({
      generation: "round-1",
      syncs: 1,
      bindings: 1,
      localIdentities: 1,
      spawns: { matched: 1, pending: 0 }
    });
  });

  it("retracts rejected, expired, and capacity-evicted prediction through one hook", () => {
    const removals: Array<{
      prediction: MultiplayerPredictedLifecycleLocalIdentity;
      reason: string;
      atTick: number;
    }> = [];
    const domain = createMultiplayerPredictedLifecycleDomain<number, number>({
      kind: "projectile",
      generation: 1,
      stepMs: 10,
      maxPending: 1,
      maxAgeTicks: 2,
      hooks: {
        onPredictionRemoved(event) {
          removals.push(event);
        }
      }
    });
    domain.register({ correlationId: "shot-1", localId: "local-1", tick: 0, value: 1 });
    domain.register({ correlationId: "shot-2", localId: "local-2", tick: 1, value: 2 });
    expect(removals).toMatchObject([
      { prediction: { localId: "local-1" }, reason: "prediction-capacity", atTick: 1 }
    ]);

    expect(domain.reject("shot-2", 2, "ammo-empty").status).toBe("rejected");
    expect(removals.at(-1)).toMatchObject({
      prediction: { localId: "local-2" },
      reason: "rejected",
      atTick: 2,
      detail: "ammo-empty"
    });

    domain.register({ correlationId: "shot-3", localId: "local-3", tick: 2, value: 3 });
    expect(domain.expire(6)).toMatchObject([{ localId: "local-3" }]);
    expect(removals.at(-1)).toMatchObject({ reason: "expired", atTick: 6 });
    expect(domain.diagnostics()).toMatchObject({ bindings: 0, localIdentities: 0 });
  });

  it("prunes authority bindings, bounds them, and resets all indexes on generation change", () => {
    const removed: Array<{ binding: MultiplayerPredictedLifecycleBinding; reason: string }> = [];
    const resets: string[] = [];
    const domain = createMultiplayerPredictedLifecycleDomain<number, number>({
      kind: "entity",
      generation: 1,
      maxBindings: 1,
      hooks: {
        onBindingRemoved(event) {
          removed.push(event);
        },
        onReset(event) {
          resets.push(`${event.previousGeneration}->${event.generation}:${event.reason}`);
        }
      }
    });
    domain.sync({
      generation: 1,
      authorityTime: 1,
      localTime: 1,
      authoritySpawns: [
        { correlationId: "a", authorityId: "authority-a", tick: 1, value: 1 },
        { correlationId: "b", authorityId: "authority-b", tick: 1, value: 2 }
      ]
    });
    expect(domain.binding("a")).toBeUndefined();
    expect(domain.binding("b")).toMatchObject({ authorityId: "authority-b" });
    expect(removed).toMatchObject([
      { binding: { correlationId: "a" }, reason: "binding-capacity" }
    ]);

    const pruned = domain.sync({
      generation: 1,
      authorityTime: 2,
      localTime: 2,
      authoritySpawns: []
    });
    expect(pruned.removedBindings).toMatchObject([{ correlationId: "b" }]);
    expect(removed.at(-1)).toMatchObject({ reason: "authority-removed" });

    domain.register({ correlationId: "old", localId: "local-old", tick: 3, value: 3 });
    expect(
      domain.sync({
        generation: 2,
        authorityTime: 0,
        localTime: 0,
        authoritySpawns: []
      }).generationChanged
    ).toBe(true);
    expect(resets).toEqual(["1->2:generation-changed"]);
    expect(domain.diagnostics()).toMatchObject({
      generation: 2,
      generationResets: 1,
      bindings: 0,
      localIdentities: 0,
      spawns: { generation: 2, pending: 0 }
    });
  });

  it("preserves the predicted identity when authority replaces an id for one correlation", () => {
    const domain = createMultiplayerPredictedLifecycleDomain<number, number>({
      kind: "projectile",
      generation: 1
    });
    domain.register({ correlationId: "shot", localId: "local-shot", tick: 1, value: 1 });
    domain.sync({
      generation: 1,
      authorityTime: 1,
      localTime: 1,
      authoritySpawns: [{ correlationId: "shot", authorityId: "authority-a", tick: 2, value: 2 }]
    });
    const replaced = domain.sync({
      generation: 1,
      authorityTime: 2,
      localTime: 2,
      authoritySpawns: [{ correlationId: "shot", authorityId: "authority-b", tick: 2, value: 2 }]
    });
    expect(replaced.removedBindings).toMatchObject([
      { correlationId: "shot", authorityId: "authority-a", localId: "local-shot" }
    ]);
    expect(domain.binding("authority-b")).toMatchObject({
      localId: "local-shot",
      authorityId: "authority-b"
    });
    expect(domain.hasLocalPrediction("authority-b")).toBe(true);
  });

  it("prevents delayed authority sync from rewinding and releases state on dispose", () => {
    const domain = createMultiplayerPredictedLifecycleDomain<number, number>({
      kind: "projectile",
      generation: 1,
      stepMs: 50
    });
    domain.sync({ generation: 1, authorityTime: 1_000, localTime: 100, authoritySpawns: [] });
    expect(
      domain.sync({ generation: 1, authorityTime: 1_020, localTime: 150, authoritySpawns: [] })
        .timeline
    ).toMatchObject({ authorityTime: 1_050, preventedRewind: true });
    domain.dispose();
    domain.dispose();
    expect(() => domain.diagnostics()).toThrow("disposed");
  });
});
