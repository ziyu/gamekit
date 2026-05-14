import type { DataRegistry } from "@gamekit/data";
import {
  createDuplicateAssetError,
  createMissingAssetError,
  createUnsupportedAssetError
} from "./errors";
import { DEFAULT_ASSET_DATA_TYPE } from "./asset-data-type";
import type {
  AssetDefinition,
  AssetLoadState,
  AssetManager,
  CreateAssetManagerOptions,
  RegisterAssetsFromDataOptions
} from "./types";

export function createAssetManager(options: CreateAssetManagerOptions): AssetManager {
  const assets = new Map<string, AssetDefinition>();
  const states = new Map<string, AssetLoadState>();
  const clock = options.clock ?? (() => Date.now());

  const emit = (
    type: string,
    assetId: string | undefined,
    payload: Record<string, unknown>
  ): void => {
    const event = {
      type,
      payload,
      source: "asset.manager"
    };
    if (assetId) {
      (event as { assetId?: string }).assetId = assetId;
    }

    options.onDiagnostic?.(event);
  };

  const requireAsset = (assetId: string): AssetDefinition => {
    const asset = assets.get(assetId);
    if (!asset) {
      throw createMissingAssetError(assetId);
    }

    return asset;
  };

  return {
    register(asset) {
      if (assets.has(asset.id)) {
        throw createDuplicateAssetError(asset.id);
      }

      assets.set(asset.id, asset);
      states.set(asset.id, { id: asset.id, status: "registered" });
      emit("asset.registered", asset.id, { assetId: asset.id, assetType: asset.type });
    },
    registerMany(nextAssets) {
      for (const asset of nextAssets) {
        this.register(asset);
      }
    },
    registerFromDataRegistry(
      registry: DataRegistry,
      registerOptions: RegisterAssetsFromDataOptions = {}
    ) {
      const type = registerOptions.type ?? DEFAULT_ASSET_DATA_TYPE;
      const definitions = registry.list<AssetDefinition>(type).map((document) => document.data);
      this.registerMany(definitions);
      return definitions;
    },
    has(id) {
      return assets.has(id);
    },
    get(id) {
      return requireAsset(id);
    },
    assets() {
      return [...assets.values()];
    },
    state(id) {
      const state = states.get(id);
      if (!state) {
        throw createMissingAssetError(id);
      }

      return { ...state };
    },
    states() {
      return [...states.values()].map((state) => ({ ...state }));
    },
    async load(id) {
      const asset = requireAsset(id);
      const current = states.get(id);
      if (current?.status === "loaded") {
        return { ...current };
      }

      if (!options.adapter.supports(asset)) {
        throw createUnsupportedAssetError(asset, options.adapter.id);
      }

      states.set(id, { id, status: "loading" });
      emit("asset.loading", id, { assetId: id, assetType: asset.type });

      try {
        await options.adapter.load(asset);
        const loaded: AssetLoadState = {
          id,
          status: "loaded",
          loadedAt: clock()
        };
        states.set(id, loaded);
        emit("asset.loaded", id, { assetId: id, assetType: asset.type });
        return { ...loaded };
      } catch (error) {
        const failed: AssetLoadState = {
          id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        };
        states.set(id, failed);
        emit("asset.failed", id, { assetId: id, error: failed.error });
        return { ...failed };
      }
    },
    async loadGroup(group) {
      const targets = [...assets.values()].filter((asset) => asset.group === group);
      return Promise.all(targets.map((asset) => this.load(asset.id)));
    }
  };
}
