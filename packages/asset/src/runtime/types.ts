import type { DataRegistry } from "@gamekit/data";

export type AssetType =
  | "image"
  | "spritesheet"
  | "atlas"
  | "audio"
  | "json"
  | "tilemap"
  | "font"
  | "shader"
  | "model"
  | "texture"
  | "custom";

export type AssetSource =
  | { type: "url"; url: string }
  | { type: "platform-file"; path: string; baseDir?: string }
  | { type: "resource"; path: string }
  | { type: "memory"; data: Uint8Array; mimeType?: string };

export type SpritesheetFrameConfig = {
  width: number;
  height: number;
  margin?: number;
  spacing?: number;
};

export type AssetDefinition = {
  id: string;
  type: AssetType;
  source: AssetSource;
  group?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  preload?: boolean;
  lazy?: boolean;
  frame?: SpritesheetFrameConfig;
};

export type AssetRef<TAssetType extends AssetType = AssetType> = {
  assetId: string;
  type?: TAssetType;
  variant?: string;
};

export type AssetLoadStatus = "registered" | "loading" | "loaded" | "failed";

export type AssetLoadState = {
  id: string;
  status: AssetLoadStatus;
  error?: string;
  loadedAt?: number;
};

export type AssetDiagnosticEvent = {
  type: string;
  assetId?: string;
  payload: Record<string, unknown>;
  source?: string;
};

export type AssetLoaderAdapter = {
  id: string;
  supports(asset: AssetDefinition): boolean;
  load(asset: AssetDefinition): Promise<void>;
};

export type CreateAssetManagerOptions = {
  adapter: AssetLoaderAdapter;
  clock?: () => number;
  onDiagnostic?: (event: AssetDiagnosticEvent) => void;
};

export type RegisterAssetsFromDataOptions = {
  type?: string;
};

export type AssetManager = {
  register(asset: AssetDefinition): void;
  registerMany(assets: AssetDefinition[]): void;
  registerFromDataRegistry(
    registry: DataRegistry,
    options?: RegisterAssetsFromDataOptions
  ): AssetDefinition[];
  has(id: string): boolean;
  get(id: string): AssetDefinition;
  assets(): AssetDefinition[];
  state(id: string): AssetLoadState;
  states(): AssetLoadState[];
  load(id: string): Promise<AssetLoadState>;
  loadGroup(group: string): Promise<AssetLoadState[]>;
};
