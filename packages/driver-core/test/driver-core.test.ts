import { describe, expect, it } from "vitest";
import { createDriverRegistry, type GameDriver } from "../src";

describe("createDriverRegistry", () => {
  it("registers and resolves drivers", () => {
    const driver = createFakeDriver("phaser");
    const registry = createDriverRegistry([driver]);

    expect(registry.has("phaser")).toBe(true);
    expect(registry.require("phaser")).toBe(driver);
    expect(registry.snapshot().drivers[0]).toMatchObject({
      id: "phaser",
      kind: "fake"
    });
  });

  it("rejects duplicate drivers clearly", () => {
    expect(() => createDriverRegistry([createFakeDriver("phaser"), createFakeDriver("phaser")]))
      .toThrowErrorMatchingInlineSnapshot(`
      [GameError: Duplicate driver: phaser]
    `);
  });

  it("rejects missing required drivers clearly", () => {
    expect(() => createDriverRegistry().require("missing")).toThrowErrorMatchingInlineSnapshot(`
      [GameError: Missing driver: missing]
    `);
  });
});

function createFakeDriver(id: string): GameDriver {
  return {
    id,
    kind: "fake",
    boot() {},
    dispose() {},
    adapters() {
      return { renderer: {} };
    },
    snapshot() {
      return {
        id,
        kind: "fake",
        phase: "registered",
        adapters: ["renderer"]
      };
    }
  };
}
