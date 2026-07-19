import type { SandboxSceneDefinition, SandboxSceneId } from "./types";

export const DEFAULT_SANDBOX_SCENE_ID: SandboxSceneId = "tiny-camp";

export const sandboxSceneCatalog: readonly SandboxSceneDefinition[] = [
  {
    id: "tiny-camp",
    shortLabel: "TC",
    title: "Tiny Camp",
    description: "Cross-module camp simulation",
    capabilities: ["Data", "Asset", "TCA", "GAS", "Renderer"],
    load: () => import("./tiny-camp")
  },
  {
    id: "combat",
    shortLabel: "CB",
    title: "Combat Range",
    description: "Physical delivery proving ground",
    capabilities: ["Combat", "Physics", "GAS", "World", "Data"],
    load: () => import("./combat")
  },
  {
    id: "audio-lab",
    shortLabel: "AU",
    title: "Audio Lab",
    description: "Game audio domain verification console",
    capabilities: ["Music", "SFX", "Dialogue", "Mix", "Spatial"],
    load: () => import("./audio-lab")
  }
] as const;

export function resolveSandboxScene(search: string): SandboxSceneDefinition {
  const requested = new URLSearchParams(search).get("scene");
  return (
    sandboxSceneCatalog.find((scene) => scene.id === requested) ??
    requireSandboxScene(DEFAULT_SANDBOX_SCENE_ID)
  );
}

export function requireSandboxScene(sceneId: SandboxSceneId): SandboxSceneDefinition {
  const scene = sandboxSceneCatalog.find((candidate) => candidate.id === sceneId);
  if (!scene) {
    throw new Error(`Sandbox scene is not registered: ${sceneId}`);
  }
  return scene;
}
