import type {
  RenderObjectConfig,
  RenderObjectPatch,
  RendererCapabilities,
  RendererBootContext
} from "@gamekit/renderer-core";

export type PhaserRendererOptions = {
  id?: string;
  backgroundColor?: string;
  debugTextureId?: string;
  driver?: PhaserRendererDriver;
};

export type PhaserRendererDriver = {
  boot(
    ctx: RendererBootContext,
    options: Required<Pick<PhaserRendererOptions, "backgroundColor" | "debugTextureId">>
  ): Promise<PhaserRendererDriverRuntime>;
  capabilities(): RendererCapabilities;
};

export type PhaserRendererDriverRuntime = {
  view: HTMLElement | HTMLCanvasElement;
  resize(width: number, height: number): void;
  destroy(): void;
  createObject(id: string, config: RenderObjectConfig): void;
  updateObject(id: string, patch: RenderObjectPatch): void;
  setParent(id: string, parentId?: string): void;
  destroyObject(id: string): void;
  playAnimation(id: string, animationId: string): void;
};
