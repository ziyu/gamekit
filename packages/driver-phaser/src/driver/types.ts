import type { AssetLoaderAdapter } from "@gamekit/asset";
import type { DriverAdapterMap, GameDriver } from "@gamekit/driver-core";
import type { InputSourceAdapter, NormalizedInputEvent } from "@gamekit/input-core";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
import type { PhaserRendererOptions } from "@gamekit/renderer-phaser";
import type { PhaserDriverCameraAdapter } from "./camera";

export type PhaserMipmapFilter =
  | "none"
  | "NEAREST"
  | "LINEAR"
  | "NEAREST_MIPMAP_NEAREST"
  | "LINEAR_MIPMAP_NEAREST"
  | "NEAREST_MIPMAP_LINEAR"
  | "LINEAR_MIPMAP_LINEAR";

export type PhaserDriverRenderOptions = {
  pixelRatio?: number;
  antialias?: boolean;
  antialiasGL?: boolean;
  roundPixels?: boolean;
  mipmapFilter?: PhaserMipmapFilter;
};

export type PhaserDriverOptions = {
  id?: string;
  backgroundColor?: string;
  render?: PhaserDriverRenderOptions;
  renderer?: Omit<PhaserRendererOptions, "id" | "runtime">;
};

export type PhaserInputSourceOptions = {
  onInput: (event: NormalizedInputEvent) => void;
  source?: string;
  clock?: () => number;
};

export type PhaserDriverAdapters = DriverAdapterMap & {
  renderer: RendererAdapter;
  assetLoader: AssetLoaderAdapter;
  camera: PhaserDriverCameraAdapter;
  createInputSource(options: PhaserInputSourceOptions): InputSourceAdapter;
};

export type PhaserGameDriver = GameDriver<PhaserDriverAdapters> & {
  boot(ctx: RendererBootContext): Promise<void>;
};
