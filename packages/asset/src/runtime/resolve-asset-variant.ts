import type { AssetDefinition } from "./types";

export function resolveAssetVariant(
  asset: AssetDefinition,
  variant?: string | undefined
): AssetDefinition {
  if (variant === undefined) {
    return asset;
  }
  const resolved = asset.variants?.[variant];
  if (resolved === undefined) {
    return asset;
  }
  return {
    ...asset,
    source: resolved.source,
    metadata: { ...asset.metadata, ...resolved.metadata }
  };
}
