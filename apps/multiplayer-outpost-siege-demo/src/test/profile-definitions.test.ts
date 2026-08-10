import { describe, expect, it } from "vitest";
import { OUTPOST_PROFILE_DEFINITIONS, outpostProfileDefinition } from "../profiles";

describe("Outpost profile definitions", () => {
  it("defines browser, server, deterministic, and Tauri content policies", () => {
    expect(Object.keys(OUTPOST_PROFILE_DEFINITIONS)).toEqual([
      "browser-web",
      "headless-server",
      "deterministic-test",
      "tauri-smoke"
    ]);
    expect(outpostProfileDefinition("headless-server")).toMatchObject({
      platform: "headless",
      driver: "none",
      loadsVisualAssets: false,
      preloadGroups: []
    });
    expect(outpostProfileDefinition("browser-web")).toMatchObject({
      platform: "web",
      driver: "phaser",
      preloadGroups: ["boot", "match", "combat"],
      lazyGroups: ["boss"]
    });
    expect(outpostProfileDefinition("deterministic-test")).toMatchObject({
      platform: "memory",
      driver: "memory",
      deterministic: true
    });
    expect(outpostProfileDefinition("tauri-smoke")).toMatchObject({
      platform: "tauri",
      driver: "phaser"
    });
  });

  it("returns defensive copies of mutable group lists", () => {
    const first = outpostProfileDefinition("browser-web");
    first.preloadGroups.length = 0;

    expect(outpostProfileDefinition("browser-web").preloadGroups).toEqual([
      "boot",
      "match",
      "combat"
    ]);
  });
});
