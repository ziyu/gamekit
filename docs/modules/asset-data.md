# Asset / Data 模块设计

## 定位

Data 管 DataKind、DataPack、全局数据注册、引用关系、索引和校验。Asset 管资源声明到运行时加载状态的转换。两者都很重要，但职责不同：Data 是全局内容数据层，Asset 是资源加载运行时。

相关包：

- `@gamekit/asset`
- `@gamekit/asset-phaser`
- `@gamekit/data`

## AssetDefinition

```ts
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

export type AssetDefinition = {
  id: string;
  type: AssetType;
  source: AssetSource;
  group?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  preload?: boolean;
  lazy?: boolean;
};
```

数据中引用 `assetId`，不直接引用 URL。

## Data Core

Data Core 是游戏内容定义的统一入口，不是某个模块的私有 Map。Actor、Ability、Effect、TCA Rule、RenderObject、Asset、Terrain、Road、Building、UI Layout、Save Migration 等都应该能作为 DataKind 注册。

```ts
export type DataKind = string;
export type DataId = string;

export type DataKey = {
  kind: DataKind;
  id: DataId;
};

export type DataKindDefinition<T> = {
  kind: DataKind;
  validate?: DataValidator<T>;
  normalize?: DataNormalizer<T>;
  references?: DataReferenceExtractor<T>;
  indexes?: DataIndexDefinition<T>[];
};

export type DataDocument<T = unknown> = {
  kind: DataKind;
  id: DataId;
  value: T;
  sourcePackId?: string;
  namespace?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};
```

模块通过注册 DataKind 扩展 DataRegistry，而不是要求 `@gamekit/data` 硬编码所有 gameplay 类型。

## DataRegistry

职责：

- register DataKind
- register DataPack
- normalize documents
- validate documents
- track source pack / namespace / priority
- query by kind/id/tag/source/index
- build reference graph
- report duplicate id、missing reference、unknown kind、schema error

DataRegistry 不加载图片、音频或模型；这些由 AssetManager 和 adapter 处理。

## AssetSource

资源来源要兼容 Web、Tauri、编辑器和 Mod。

```ts
export type AssetSource =
  | { type: "url"; url: string }
  | { type: "platform-file"; path: string; baseDir: FsBaseDir }
  | { type: "resource"; path: string }
  | { type: "memory"; data: Uint8Array; mimeType?: string };
```

## AssetManager

职责：

- register assets
- register assets from DataRegistry
- lookup asset
- load group
- load single asset
- track loading state
- emit low-frequency asset events

实际加载由 adapter 执行：

- `@gamekit/asset-phaser` 映射到 Phaser loader。
- Three.js model/texture loader 放 adapter 中。

AssetManager 只保存运行时加载状态，例如 registered、loading、loaded、failed。它不替代 DataRegistry，也不保存 Actor、Ability、Rule 等 gameplay definition。

Asset adapter 只接收 AssetDefinition，不读取整个 DataPack。这样可以让 AssetManager 从 DataRegistry、Editor import、测试夹具或未来远程内容服务中接收同一种资源声明。

## DataPack

DataPack 是内容扩展入口。它承载任意 DataKind 的文档集合，不应该被限制为 assets/renderObjects。

```ts
export type DataPack = {
  id: string;
  version: string;
  namespace?: string;
  priority?: number;
  data: Record<DataKind, unknown[]>;
  patches?: DataPatch[];
  metadata?: Record<string, unknown>;
};
```

## 加载流程

```txt
register DataKind
→ load/parse DataPack
→ normalize documents
→ register documents
→ build indexes
→ extract references
→ validate references
→ expose snapshot/query API
```

## 校验重点

- duplicate id
- missing assetId
- missing renderObjectId
- unknown actor/ability/effect/rule reference
- DataPack 使用运行时 renderer 不支持的 render type
- DataPack 使用运行时 platform 不支持的 asset source

## 与 Renderer 的关系

Renderer 相关定义通过 DataKind 注册。Actor 不直接写 sprite，而是引用 render object：

```ts
presentation: {
  renderObject: "render.actor.hero.guardian";
}
```

Renderer adapter 根据 `RenderObjectDefinition.type` 映射到底层对象。

## 与 Asset 的关系

AssetDefinition 可以作为 DataKind 进入 DataRegistry，但资源加载状态不属于 DataRegistry：

```txt
DataRegistry
→ AssetDefinition documents
→ AssetManager
→ Asset adapter
→ renderer/runtime backend
```

Data 负责 asset definition 的 id、引用和校验；AssetManager 负责 load/unload/status/retry/diagnostic。

## 与 Effect 的关系

Effect 库可作为 Asset/Data/Save pipeline 内部实现选择，但不作为业务公共 API 强制暴露。
