import { defineComponent, type GameWorld } from "@gamekit/world";
import { describe, expect, it } from "vitest";

export function defineWorldConformanceTests(name: string, createWorld: () => GameWorld): void {
  const Position = defineComponent({
    id: "test.position",
    create: (data?: Partial<{ x: number; y: number }>) => ({
      x: data?.x ?? 0,
      y: data?.y ?? 0
    })
  });

  const Velocity = defineComponent({
    id: "test.velocity",
    create: (data?: Partial<{ x: number; y: number }>) => ({
      x: data?.x ?? 0,
      y: data?.y ?? 0
    })
  });

  describe(`${name} GameWorld conformance`, () => {
    it("spawns and despawns entities", () => {
      const world = createWorld();
      const entity = world.spawn();

      expect(world.has(entity)).toBe(true);
      expect(world.count()).toBe(1);

      world.despawn(entity);

      expect(world.has(entity)).toBe(false);
      expect(world.count()).toBe(0);
    });

    it("adds, reads, sets, and removes components", () => {
      const world = createWorld();
      const entity = world.spawn();

      world.add(entity, Position, { x: 4, y: 2 });
      expect(world.get(entity, Position)).toEqual({ x: 4, y: 2 });

      world.set(entity, Position, { x: 8 });
      expect(world.get(entity, Position)).toEqual({ x: 8, y: 2 });

      world.remove(entity, Position);
      expect(world.get(entity, Position)).toBeUndefined();
    });

    it("queries entities that have all requested components", () => {
      const world = createWorld();
      const still = world.spawn();
      const moving = world.spawn();
      const hidden = world.spawn();

      world.add(still, Position, { x: 1, y: 1 });
      world.add(moving, Position, { x: 2, y: 2 });
      world.add(moving, Velocity, { x: 1, y: 0 });
      world.add(hidden, Velocity, { x: 0, y: 1 });

      expect(world.query([Position])).toEqual([still, moving]);
      expect(world.query([Position, Velocity])).toEqual([moving]);
      expect(world.query([Velocity])).toEqual([moving, hidden]);
    });
  });
}
