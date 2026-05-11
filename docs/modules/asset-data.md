# Asset / Data 模块设计

## 定位

Asset 管资源声明、注册和加载状态；Data 管 DataPack 定义、加载、校验和引用关系。

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
- lookup asset
- load group
- load single asset
- track loading state
- emit low-frequency asset events

实际加载由 adapter 执行：

- `@gamekit/asset-phaser` 映射到 Phaser loader。
- Three.js model/texture loader 放 adapter 中。

## DataPack

DataPack 是内容扩展入口。

```ts
export type DataPack = {
  id: string;
  assets?: AssetManifest[];
  renderObjects?: RenderObjectDefinition[];
  actors?: ActorDefinition[];
  abilities?: AbilityDefinition[];
  effects?: GameplayEffectDefinition[];
  clues?: ClueDefinition[];
  tcaRules?: TcaRule[];
  terrain?: TerrainDefinition[];
  roads?: RoadDefinition[];
  buildings?: BuildingDefinition[];
  randomEvents?: RandomEventDefinition[];
};
```

## 加载流程

```txt
loadDataPack
→ register assets
→ register render objects
→ register gameplay definitions
→ register TCA rules
→ validate references
→ compile rules / abilities
```

## 校验重点

- duplicate id
- missing assetId
- missing renderObjectId
- unknown actor/ability/effect/rule reference
- DataPack 使用运行时 renderer 不支持的 render type
- DataPack 使用运行时 platform 不支持的 asset source

## 与 Renderer 的关系

DataPack 支持 `renderObjects`。Actor 不直接写 sprite，而是引用 render object：

```ts
presentation: {
  renderObject: "render.actor.hero.guardian";
}
```

Renderer adapter 根据 `RenderObjectDefinition.type` 映射到底层对象。

## 与 Effect 的关系

Effect 库可作为 Asset/Data/Save pipeline 内部实现选择，但不作为业务公共 API 强制暴露。
