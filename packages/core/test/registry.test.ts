import { describe, expect, it } from "vitest";
import { GameError, Registry, createSeededRng } from "../src/index";

describe("Registry", () => {
  it("registers and reads items", () => {
    const registry = new Registry<number>();
    registry.register("answer", 42);

    expect(registry.get("answer")).toBe(42);
    expect(registry.has("answer")).toBe(true);
  });

  it("throws a GameError for duplicate ids", () => {
    const registry = new Registry<number>();
    registry.register("item", 1);

    expect(() => registry.register("item", 2)).toThrow(GameError);
    expect(() => registry.register("item", 2)).toThrow("Duplicate registry id: item");
  });

  it("throws a GameError for missing ids", () => {
    const registry = new Registry<number>();

    expect(() => registry.get("missing")).toThrow(GameError);
    expect(() => registry.get("missing")).toThrow("Missing registry item: missing");
  });
});

describe("createSeededRng", () => {
  it("creates deterministic streams for the same seed", () => {
    const a = createSeededRng("abyss-delve-dev-seed");
    const b = createSeededRng("abyss-delve-dev-seed");

    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});
