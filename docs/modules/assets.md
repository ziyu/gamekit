# Assets 模块设计

## 定位

Assets 负责资源声明、来源解析、加载状态、adapter 委托和低频诊断。它不负责定义英雄、怪物、建筑、规则或任意 gameplay 数据结构。

相关包：

- `@gamekit/asset`
- `@gamekit/driver-phaser`
- `@gamekit/driver-three`

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

AssetManager 也不是 Content Package manager。它读取资源定义、解析资源来源、委托 adapter 加载资源；实际资源文件可能来自 URL、platform resource、编辑器 workspace、远程 CDN 或未来 Content Package mount。Asset 模块只关心最终可解析的 AssetDefinition / AssetSource，不关心内容包如何被发现、启用或卸载。

## Preload Plan

AssetManager 应能从已注册的 `asset.definition` 生成 preload plan。preload plan 是资源运行时计划，不是 DataPack，也不改变游戏内容结构。

preload plan 的输入可以来自：

- `asset.definition.preload`
- `asset.definition.group`
- app/profile 指定的 preload groups
- editor/devtools 发起的显式加载请求
- gameplay runtime 发起的 lazy load 请求

preload plan 的输出应包含：

- 待加载 asset id。
- asset type / source。
- group / tags / priority。
- source pack metadata where available。
- content package metadata where available。
- 预计使用的 asset adapter 或 driver adapter。

AssetManager 可以按 group 加载资源，例如：

```txt
boot
→ load preload group
→ start game
→ lazy load optional groups
```

资源加载失败不能伪装成 Data 校验失败。Data 缺失引用和 Asset adapter 加载失败是两类诊断，必须在 snapshot 中区分。

## Adapter

实际加载由 adapter 执行。对于 Phaser、Three.js 这类拥有共享资源 cache / loader / scene 的外部运行时，asset loader adapter 应由对应 Driver 暴露，而不是单独持有底层 runtime。

- Phaser Driver 的 asset loader adapter 映射到 Phaser loader / texture manager。
- Three Driver 的 asset loader adapter 映射到 texture、GLB/glTF、material 和 environment map loader。
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
→ preload plan
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
- 根据 preload / group / lazy 策略生成加载计划。
- 记录加载状态。
- 报告加载失败、重试、卸载和 adapter 状态。

App Host 可以编排 Data pipeline 与 Asset preload 的顺序，但 Asset 模块本身仍不读取 DataPack、不解释 gameplay data。

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

## 最佳实践

### 模块集成

- App Host/profile 负责按 Data → AssetManager → adapter preload 的顺序集成资源系统；AssetManager 不自己读取 DataPack 或猜测 gameplay document。
- Phaser、Three 等资源加载必须通过 Driver 暴露的 asset loader adapter，共享同一个外部 runtime cache；不要为 Asset 单独创建另一套 Phaser/Three runtime。
- Preload group 应面向启动体验和场景切换，不应把所有资源一次性塞进首屏加载。大资源、可选包和编辑器预览应支持 lazy/retry/unload。
- 有界 group retry 使用 `loadAssetGroupWithRetry(...)`；已成功资源由 AssetManager cache 跳过，只重试 failed member。调用方必须显式设置最大尝试次数并通过 attempt hook 接入进度或诊断，不能在 app 内实现无界重试循环；attempt observer 及其 error reporter 的异常不能改变资源加载结果。
- 空 group 返回失败结果并产生 `asset.group_missing` diagnostic，不把“没有任何加载目标”当成成功，也不重复空重试。

### 模块使用

- AssetDefinition 是资源声明，AssetManager 是运行时加载状态管理；不要把 gameplay data、DataPack 解析或 renderer native object 放进 AssetManager。
- 资源引用应使用 AssetRef 或业务数据里的明确资源引用字段，不要求资源定义与使用者处于同一 DataPack。
- AssetManager 默认只读取 `asset.definition` 或外部显式指定的同形资源定义；不要让它扫描任意 gameplay document 猜测资源。
- 资源加载失败、缺失引用和平台 source 不支持要分成不同 diagnostics，方便编辑器和 DevTools 给出正确修复建议。
- Renderer 使用 asset id 或 adapter-specific props 取资源句柄；gameplay、DataType 和 Save payload 不保存 texture、image element、WebGL resource 或 Phaser cache object。
