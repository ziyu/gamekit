import { GameError } from "@gamekit/core";
import type { AssetDefinition, AssetLoaderAdapter } from "@gamekit/asset";
import type { CreatePhaserAssetAdapterOptions } from "./types";

export function createPhaserAssetAdapter(
  options: CreatePhaserAssetAdapterOptions
): AssetLoaderAdapter {
  return {
    id: "asset.phaser",
    supports(asset) {
      return (
        asset.source.type === "url" && (asset.type === "image" || asset.type === "spritesheet")
      );
    },
    async load(asset) {
      if (asset.source.type !== "url") {
        throw unsupported(asset);
      }
      if (options.runtime.hasTexture(asset.id)) {
        return;
      }

      if (asset.type === "image") {
        await options.runtime.loadImage(asset.id, asset.source.url);
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
        await options.runtime.loadSpritesheet(asset.id, asset.source.url, asset.frame);
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
