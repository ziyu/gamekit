import type { DataTypeDefinition } from "@gamekit/data";
import type { AssetDefinition, AssetSource, AssetType } from "./types";

export type AssetDataTypeOptions = {
  type?: string;
  supportedTypes?: AssetType[];
  supportedSources?: AssetSource["type"][];
};

export const DEFAULT_ASSET_DATA_TYPE = "asset.definition";

export function createAssetDataType(
  options: AssetDataTypeOptions = {}
): DataTypeDefinition<AssetDefinition> {
  const type = options.type ?? DEFAULT_ASSET_DATA_TYPE;
  const supportedTypes = new Set(
    options.supportedTypes ?? [
      "image",
      "spritesheet",
      "atlas",
      "audio",
      "json",
      "tilemap",
      "font",
      "shader",
      "model",
      "texture",
      "custom"
    ]
  );
  const supportedSources = new Set(
    options.supportedSources ?? ["url", "platform-file", "resource", "memory"]
  );

  return {
    type,
    getTags: (asset) => asset.tags ?? [],
    getMetadata: (asset) => asset.metadata,
    validate(document) {
      const diagnostics = [];
      const asset = document.data;

      if (!supportedTypes.has(asset.type)) {
        diagnostics.push({
          code: "asset.unknown_type",
          message: `Unknown asset type: ${asset.type}`,
          severity: "error" as const,
          key: document
        });
      }

      if (!supportedSources.has(asset.source.type)) {
        diagnostics.push({
          code: "asset.unsupported_source",
          message: `Unsupported asset source: ${asset.source.type}`,
          severity: "error" as const,
          key: document
        });
      }

      if (asset.type === "spritesheet" && !asset.frame) {
        diagnostics.push({
          code: "asset.missing_spritesheet_frame",
          message: `Spritesheet asset requires frame config: ${asset.id}`,
          severity: "error" as const,
          key: document
        });
      }

      return diagnostics;
    }
  };
}
