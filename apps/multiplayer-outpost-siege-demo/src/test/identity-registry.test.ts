import { describe, expect, it } from "vitest";
import { createOutpostIdentityRegistry } from "../domain";

describe("Outpost identity registry", () => {
  it("maps all framework identities without leaking backend objects", () => {
    const registry = createOutpostIdentityRegistry();
    registry.register({
      gameplayObjectId: "player:alpha",
      entityId: 1,
      actorId: "actor:alpha",
      physicsBodyId: "body:alpha",
      physicsColliderIds: ["collider:alpha", "hurtbox:alpha"],
      network: { entityId: "network:alpha", generation: 3 },
      renderObjectId: "render:alpha"
    });

    expect(registry.byEntityId(1)?.gameplayObjectId).toBe("player:alpha");
    expect(registry.byActorId("actor:alpha")?.entityId).toBe(1);
    expect(registry.byPhysicsBodyId("body:alpha")?.entityId).toBe(1);
    expect(registry.byPhysicsColliderId("hurtbox:alpha")?.entityId).toBe(1);
    expect(registry.byNetworkIdentity({ entityId: "network:alpha", generation: 3 })?.entityId).toBe(
      1
    );
    expect(registry.byRenderObjectId("render:alpha")?.entityId).toBe(1);
  });

  it("rejects duplicate identities atomically and cleans every reverse index", () => {
    const registry = createOutpostIdentityRegistry();
    registry.register({
      gameplayObjectId: "enemy:one",
      entityId: 1,
      actorId: "actor:one",
      physicsColliderIds: ["collider:one"],
      network: { entityId: "enemy", generation: 1 }
    });

    expect(() =>
      registry.register({
        gameplayObjectId: "enemy:two",
        entityId: 2,
        actorId: "actor:one",
        renderObjectId: "render:two"
      })
    ).toThrow(/Duplicate Outpost identity actorId/);
    expect(registry.snapshot()).toHaveLength(1);
    expect(registry.byEntityId(2)).toBeUndefined();
    expect(registry.byRenderObjectId("render:two")).toBeUndefined();

    expect(registry.remove("enemy:one")).toBe(true);
    expect(registry.byEntityId(1)).toBeUndefined();
    expect(registry.byActorId("actor:one")).toBeUndefined();
    expect(registry.byPhysicsColliderId("collider:one")).toBeUndefined();
    expect(registry.byNetworkIdentity({ entityId: "enemy", generation: 1 })).toBeUndefined();
  });

  it("keeps numeric and string entity ids distinct", () => {
    const registry = createOutpostIdentityRegistry();
    registry.register({ gameplayObjectId: "numeric", entityId: 1 });
    registry.register({ gameplayObjectId: "string", entityId: "1" });

    expect(registry.byEntityId(1)?.gameplayObjectId).toBe("numeric");
    expect(registry.byEntityId("1")?.gameplayObjectId).toBe("string");
  });
});
