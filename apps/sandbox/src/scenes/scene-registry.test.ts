import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANDBOX_SCENE_ID,
  requireSandboxScene,
  resolveSandboxScene,
  sandboxSceneCatalog
} from "./registry";

describe("Sandbox scene registry", () => {
  it("resolves each scene independently and falls back without coupling the scene modules", () => {
    expect(sandboxSceneCatalog.map((scene) => scene.id)).toEqual([
      "tiny-camp",
      "combat",
      "audio-lab",
      "animator-lab",
      "navigation-lab"
    ]);
    expect(resolveSandboxScene("?scene=combat").id).toBe("combat");
    expect(resolveSandboxScene("?scene=tiny-camp").id).toBe("tiny-camp");
    expect(resolveSandboxScene("?scene=audio-lab").id).toBe("audio-lab");
    expect(resolveSandboxScene("?scene=animator-lab").id).toBe("animator-lab");
    expect(resolveSandboxScene("?scene=navigation-lab").id).toBe("navigation-lab");
    expect(resolveSandboxScene("?scene=unknown").id).toBe(DEFAULT_SANDBOX_SCENE_ID);
    expect(requireSandboxScene("combat").capabilities).toContain("Combat");
    expect(requireSandboxScene("audio-lab").capabilities).toContain("Dialogue");
    expect(requireSandboxScene("animator-lab").capabilities).toContain("Marker");
    expect(requireSandboxScene("navigation-lab").capabilities).toContain("Route Field");
  });
});
