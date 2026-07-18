export type SandboxSceneId = "tiny-camp" | "combat";

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
