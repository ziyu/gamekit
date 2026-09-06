import type { PhaserDriverRenderOptions, PhaserMipmapFilter } from "./types";

export type ResolvedPhaserDriverRenderOptions = {
  pixelRatio: number;
  antialias: boolean;
  antialiasGL: boolean;
  roundPixels: boolean;
  mipmapFilter: Exclude<PhaserMipmapFilter, "none"> | "";
};

export function resolvePhaserDriverRenderOptions(
  options: PhaserDriverRenderOptions | undefined
): ResolvedPhaserDriverRenderOptions {
  const pixelRatio = options?.pixelRatio ?? 1;
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new RangeError("Phaser Driver pixelRatio must be a finite positive number");
  }

  return {
    pixelRatio,
    antialias: options?.antialias ?? true,
    antialiasGL: options?.antialiasGL ?? true,
    roundPixels: options?.roundPixels ?? false,
    mipmapFilter: options?.mipmapFilter === "none" ? "" : (options?.mipmapFilter ?? "")
  };
}
