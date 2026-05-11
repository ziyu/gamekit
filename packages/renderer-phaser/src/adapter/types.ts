import type {
  RenderCommand,
  RenderNodePatch,
  RenderNodePath,
  RenderObjectDefinition,
  RenderObjectHandle,
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
  createObject(id: string, definition: RenderObjectDefinition): void;
  updateObject(id: string, patch: RenderObjectPatch): void;
  updateNode(id: string, nodePath: RenderNodePath, patch: RenderNodePatch): void;
  destroyObject(id: string): void;
  command(id: string, command: RenderCommand): void;
  getObjectHandle(id: string): RenderObjectHandle<unknown, unknown>;
};
