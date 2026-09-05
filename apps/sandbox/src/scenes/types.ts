export type SandboxSceneId =
  | "tiny-camp"
  | "combat"
  | "audio-lab"
  | "animator-lab"
  | "character-controller-lab"
  | "ai-lab"
  | "navigation-lab"
  | "multiplayer-projectile-lab";

export type SandboxSceneModule = {
  mount(root: HTMLElement): Promise<void>;
};

export type SandboxSceneDefinition = {
  id: SandboxSceneId;
  shortLabel: string;
  title: string;
  description: string;
  capabilities: string[];
  load(): Promise<SandboxSceneModule>;
};
