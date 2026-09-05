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
      "character-controller-lab",
      "ai-lab",
      "navigation-lab",
      "multiplayer-projectile-lab"
    ]);
    expect(resolveSandboxScene("?scene=combat").id).toBe("combat");
    expect(resolveSandboxScene("?scene=tiny-camp").id).toBe("tiny-camp");
    expect(resolveSandboxScene("?scene=audio-lab").id).toBe("audio-lab");
    expect(resolveSandboxScene("?scene=animator-lab").id).toBe("animator-lab");
    expect(resolveSandboxScene("?scene=character-controller-lab").id).toBe(
      "character-controller-lab"
    );
    expect(resolveSandboxScene("?scene=ai-lab").id).toBe("ai-lab");
    expect(resolveSandboxScene("?scene=navigation-lab").id).toBe("navigation-lab");
    expect(resolveSandboxScene("?scene=multiplayer-projectile-lab").id).toBe(
      "multiplayer-projectile-lab"
    );
    expect(resolveSandboxScene("?scene=unknown").id).toBe(DEFAULT_SANDBOX_SCENE_ID);
    expect(requireSandboxScene("combat").capabilities).toContain("Combat");
    expect(requireSandboxScene("audio-lab").capabilities).toContain("Dialogue");
    expect(requireSandboxScene("animator-lab").capabilities).toContain("Marker");
    expect(requireSandboxScene("character-controller-lab").capabilities).toContain(
      "Character Motor"
    );
    expect(requireSandboxScene("character-controller-lab").capabilities).toContain(
      "Third-person Camera"
    );
    expect(requireSandboxScene("ai-lab").capabilities).toContain("Scheduler");
    expect(requireSandboxScene("navigation-lab").capabilities).toContain("Route Field");
    expect(requireSandboxScene("multiplayer-projectile-lab").capabilities).toContain("Prediction");
  });
});
