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
  },
  {
    id: "animator-lab",
    shortLabel: "AN",
    title: "Animator Lab",
    description: "Semantic state, one-shot, marker, and phase playback bay",
    capabilities: ["Graph", "Layer", "One-shot", "Marker", "Phase Seek"],
    load: () => import("./animator-lab")
  },
  {
    id: "character-controller-lab",
    shortLabel: "CC",
    title: "Character Controller Lab",
    description: "Free-camera third-person locomotion and physics proving park",
    capabilities: [
      "Character Motor",
      "Third-person Camera",
      "Rapier3D",
      "Ground Probe",
      "Slope + Step",
      "Platform",
      "Coyote + Buffer",
      "Dive + Stagger"
    ],
    load: () => import("./character-controller-lab")
  },
  {
    id: "ai-lab",
    shortLabel: "AI",
    title: "AI Lab",
    description: "Utility decisions, interruption policy, memory, and budget pressure",
    capabilities: ["Utility", "Memory", "Task", "Intent", "Scheduler"],
    load: () => import("./ai-lab")
  },
  {
    id: "navigation-lab",
    shortLabel: "NV",
    title: "Navigation Lab",
    description: "Ashen Ford terrain, route choices, and replaceable backends",
    capabilities: ["Game Terrain", "Path", "Route Field", "Backend Provider", "Obstacles"],
    load: () => import("./navigation-lab")
  },
  {
    id: "multiplayer-projectile-lab",
    shortLabel: "MP",
    title: "Projectile Combat Field",
    description: "Playable kinematic and rigid-body firefight across three network truths",
    capabilities: [
      "Multiplayer",
      "Multi-weapon Combat",
      "Prediction",
      "Physics Sweep",
      "Rigid Body",
      "Island Replay",
      "Authority",
      "Remote Playback"
    ],
    load: () => import("./multiplayer-projectile-lab")
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
