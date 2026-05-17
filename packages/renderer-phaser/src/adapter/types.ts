export type PhaserRendererOptions = {
  id?: string;
  debugTextureId?: string;
  runtime: PhaserRendererRuntime | (() => PhaserRendererRuntime | undefined);
};

export type PhaserRendererRuntime = {
  view: HTMLElement | HTMLCanvasElement;
  scene: unknown;
  resize?(width: number, height: number): void;
};
