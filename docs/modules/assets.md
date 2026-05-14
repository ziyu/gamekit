# Assets 模块设计

## 定位

Assets 负责资源声明、来源解析、加载状态、adapter 委托和低频诊断。它不负责定义英雄、怪物、建筑、规则或任意 gameplay 数据结构。

相关包：

- `@gamekit/asset`
- `@gamekit/asset-phaser`

核心原则：

- Asset 是资源运行时，不是内容数据模型。
- AssetDefinition 可以作为 `asset.definition` DataType 注册进 DataRegistry，也可以由编辑器、导入器、远程 manifest 或测试夹具直接提供给 AssetManager。
- 游戏数据通过显式 AssetRef 引用资源，不直接引用 URL。
- 资源定义不要求和引用它的数据位于同一个 DataPack。
- Asset adapter 只接收资源定义和加载请求，不读取整个 DataPack，不管理 gameplay definitions。

## AssetRef

AssetRef 是数据字段中的轻量资源引用。

```ts
export type AssetRef<TAssetType extends AssetType = AssetType> = {
  assetId: string;
  type?: TAssetType;
  variant?: string;
};
```

示例：

```ts
export type HeroVisuals = {
  portrait: AssetRef<"image">;
  model?: AssetRef<"model">;
  voiceBank?: AssetRef<"audio">;
};
```

AssetRef 只表达引用，不表达资源必须在哪里定义。资源可以来自基础包、DLC、mod、远程 manifest、平台 resource 或编辑器工作区。

## AssetDefinition

AssetDefinition 描述资源是什么、从哪里来、如何加载，但不代表资源已经进入 renderer、audio backend 或 GPU。

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

`asset.definition` 是 GameKit 内置 DataType。DataRegistry 负责校验定义、追踪来源和引用关系；AssetManager 负责加载状态。

## AssetSource

资源来源要兼容 Web、Tauri、编辑器和 Mod。

```ts
export type AssetSource =
  | { type: "url"; url: string }
  | { type: "platform-file"; path: string; baseDir: FsBaseDir }
  | { type: "resource"; path: string }
  | { type: "memory"; data: Uint8Array; mimeType?: string };
```

AssetSource 只描述来源，不直接暴露平台私有 API。具体解析由 Platform service 或 asset adapter 完成。

## AssetManager

职责：

- 从 DataRegistry 读取 `asset.definition`。
- register assets from manifest/editor/importer。
- lookup asset。
- load group。
- load single asset。
- track loading state。
- unload/retry where adapter supports it。
- emit low-frequency asset events。
- expose asset snapshot for UI/DevTools。

AssetManager 只保存运行时加载状态，例如 registered、loading、loaded、failed。它不替代 DataRegistry，也不保存 Actor、Ability、Rule 等 gameplay definition。

## Adapter

实际加载由 adapter 执行：

- `@gamekit/asset-phaser` 映射到 Phaser loader。
- Three.js model/texture loader 放 adapter 中。
- 音频、字体、shader、bundle 等未来资源通过对应 adapter 接入。

Asset adapter 边界：

- 接收 AssetDefinition。
- 执行 load/unload/retry where supported。
- 返回稳定加载状态或错误。
- 不读取 DataPack。
- 不解释 gameplay 数据。
- 不把 Phaser、Three.js、平台私有对象泄漏到 `@gamekit/asset` 公共 API。

## 与 Data 的关系

Data 和 Asset 的关系是声明与运行时加载的关系：

```txt
DataRegistry
→ asset.definition documents
→ AssetManager
→ Asset adapter
→ renderer/audio/platform backend
```

Data 负责：

- 注册 `asset.definition`。
- 追踪哪些数据字段引用了 AssetRef。
- 报告缺失 AssetRef 目标和来源位置。

Asset 负责：

- 根据 AssetDefinition 加载资源。
- 记录加载状态。
- 报告加载失败、重试、卸载和 adapter capability。

## 与 Renderer 的关系

Renderer 不直接解析 URL。RenderObject、game presentation 或 adapter-specific props 可以引用 AssetRef / asset id，AssetManager 负责确保资源被加载并能被 renderer adapter 使用。

Renderer adapter 可以持有底层资源句柄，但这些句柄不进入 gameplay 数据模型。

## 校验重点

- duplicate asset id
- unknown asset type
- unsupported asset source for current platform
- missing AssetRef target
- invalid source path or URL
- preload group missing
- adapter load failure

缺失引用和加载失败是两类问题：缺失引用属于数据/声明错误，加载失败属于运行时资源错误。两者都必须能在 snapshot 和 diagnostics 中区分。
