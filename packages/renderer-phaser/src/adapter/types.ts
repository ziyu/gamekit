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
  onRuntime?: (runtime: PhaserRendererDriverRuntime) => void;
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
  camera?: PhaserRendererCameraRuntime;
  resize(width: number, height: number): void;
  destroy(): void;
  createObject(id: string, definition: RenderObjectDefinition): void;
  updateObject(id: string, patch: RenderObjectPatch): void;
  updateNode(id: string, nodePath: RenderNodePath, patch: RenderNodePatch): void;
  destroyObject(id: string): void;
  command(id: string, command: RenderCommand): void;
  getObjectHandle(id: string): RenderObjectHandle<unknown, unknown>;
};

export type PhaserRendererCameraRuntime = {
  setScroll(x: number, y: number): void;
  setZoom(zoom: number): void;
  setRotation(rotation: number): void;
  screenToWorld(point: { x: number; y: number }): { x: number; y: number };
  worldToScreen(point: { x: number; y: number }): { x: number; y: number };
};
