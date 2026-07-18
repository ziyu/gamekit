import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANDBOX_SCENE_ID,
  requireSandboxScene,
  resolveSandboxScene,
  sandboxSceneCatalog
} from "./registry";

describe("Sandbox scene registry", () => {
  it("resolves each scene independently and falls back without coupling the scene modules", () => {
    expect(sandboxSceneCatalog.map((scene) => scene.id)).toEqual(["tiny-camp", "combat"]);
    expect(resolveSandboxScene("?scene=combat").id).toBe("combat");
    expect(resolveSandboxScene("?scene=tiny-camp").id).toBe("tiny-camp");
    expect(resolveSandboxScene("?scene=unknown").id).toBe(DEFAULT_SANDBOX_SCENE_ID);
    expect(requireSandboxScene("combat").capabilities).toContain("Combat");
  });
});
