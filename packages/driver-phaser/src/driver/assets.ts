import type { AssetDefinition, AssetLoaderAdapter } from "@gamekit/asset";
import { GameError } from "@gamekit/core";

export type PhaserDriverAssetRuntime = {
  hasTexture(id: string): boolean;
  loadImage(assetId: string, url: string): Promise<void>;
  loadSpritesheet(
    assetId: string,
    url: string,
    frame: { width: number; height: number; margin?: number; spacing?: number }
  ): Promise<void>;
};

export function createPhaserDriverAssetLoader(options: {
  id: string;
  runtime: () => PhaserDriverAssetRuntime;
}): AssetLoaderAdapter {
  return {
    id: options.id,
    supports(asset) {
      return (
        asset.source.type === "url" && (asset.type === "image" || asset.type === "spritesheet")
      );
    },
    async load(asset) {
      const runtime = options.runtime();
      if (asset.source.type !== "url") {
        throw unsupported(asset);
      }
      if (runtime.hasTexture(asset.id)) {
        return;
      }

      if (asset.type === "image") {
        await runtime.loadImage(asset.id, asset.source.url);
        return;
      }

      if (asset.type === "spritesheet") {
        if (!asset.frame) {
          throw new GameError(
            "asset.phaser.missing_spritesheet_frame",
            `Spritesheet asset requires frame config: ${asset.id}`,
            { assetId: asset.id }
          );
        }
        await runtime.loadSpritesheet(asset.id, asset.source.url, asset.frame);
        return;
      }

      throw unsupported(asset);
    }
  };
}

function unsupported(asset: AssetDefinition): GameError {
  return new GameError("asset.phaser.unsupported", `Unsupported Phaser asset: ${asset.id}`, {
    assetId: asset.id,
    assetType: asset.type,
    sourceType: asset.source.type
  });
}
