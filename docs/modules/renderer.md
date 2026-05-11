# Renderer 模块设计

## 定位

Renderer 是表现层 facade。Gameplay、ECS、DataPack 不直接依赖 Phaser Sprite、Three Mesh 或任何具体渲染对象。

相关包：

- `@gamekit/renderer-core`
- `@gamekit/renderer-phaser`
- 可选 adapter：`@gamekit/renderer-three`

## 核心原则

- Renderer Core 只定义通用 render object protocol。
- Render type 是开放字符串，由 adapter 声明和解释。
- 复合渲染对象是一等能力。
- Renderer 不拥有 gameplay input 语义。
- 复杂对象和热点路径必须允许受控 escape hatch。

## Render Object

Render object 是可配置渲染对象，可以是简单对象，也可以是对象树根节点。

长期目标结构：

```ts
export type RenderObjectDefinition = {
  id?: RenderObjectId;
  type: string;
  assetRefs?: Record<string, AssetRef>;
  transform?: RenderTransform;
  layer?: string;
  visible?: boolean;
  props?: Record<string, unknown>;
  children?: RenderNodeDefinition[];
  animations?: RenderAnimationDefinition[];
  tags?: string[];
};
```

`type` 不由 core 固定枚举。示例：

- `debug.square`
- `sprite`
- `animated-sprite`
- `tilemap`
- `mesh`
- `model`
- `particle-emitter`
- `container`
- `composite`
- `phaser-custom`
- `three-custom`

## Transform

Transform 需要兼容 2D 和 3D。

长期目标：

```ts
export type RenderTransform = {
  position?: { x?: number; y?: number; z?: number };
  rotation?: { x?: number; y?: number; z?: number };
  scale?: { x?: number; y?: number; z?: number };
  origin?: { x?: number; y?: number; z?: number };
};
```

协议可以在保持语义完整的前提下采用精简 envelope，但不得回退到 sprite-only API。

## Renderer Adapter

RendererAdapter 长期方向：

```ts
export type RendererAdapter = {
  id: string;
  boot(ctx: RendererBootContext): Promise<void>;
  destroy(): void;
  getView(): HTMLElement | HTMLCanvasElement;
  resize(width: number, height: number): void;

  capabilities(): RendererCapabilities;
  createObject(definition: RenderObjectDefinition): RenderObjectId;
  updateObject(id: RenderObjectId, patch: RenderObjectPatch): void;
  destroyObject(id: RenderObjectId): void;
  updateNode?(objectId: RenderObjectId, nodePath: string | string[], patch: RenderNodePatch): void;
  command?(objectId: RenderObjectId, command: RenderCommand): void;
};
```

Renderer Core 不定义 `createSprite`、`updateSprite`、`onInput` 作为长期公共协议。

## Render Command

复杂表现使用命令扩展，不在 core 上预设所有方法。

```ts
export type RenderCommand = {
  type: string;
  target?: string | string[];
  args?: Record<string, unknown>;
};
```

示例：

- `animation.play`
- `particles.emit`
- `shader.set_uniform`
- `camera.shake`

## Phaser Adapter

`@gamekit/renderer-phaser`：

- 依赖 Phaser。
- 不导出 Phaser 类型作为公共 API。
- 内部维护 render type registry。
- 映射 `debug.square`、`sprite`、`container` 等类型到 Phaser object。
- 可以提供 debug texture。
- 不承担 gameplay input；input 归 `input-*` 模块。

## Escape Hatch

通用 API 负责默认路径。复杂对象和热点路径需要受控逃生口：

```ts
export type RenderObjectHandle<TNative = unknown, TApi = unknown> = {
  id: RenderObjectId;
  type: string;
  native: TNative;
  api?: TApi;
  escaped?: boolean;
};
```

边界：

- 对象仍由 RendererAdapter 创建和销毁。
- Runtime 仍持有 objectId 和生命周期。
- 直接控制 API 只用于表现层，不写 gameplay 状态。
- DevTools 需要能标记 escaped/native/direct/custom path。

## 与 DataPack 的关系

DataPack 应支持 `renderObjects`，Actor/Ability/Cue 引用 render object id，而不是直接写 sprite。

```ts
export type DataPack = {
  renderObjects?: RenderObjectDefinition[];
};
```

## 与 Cue/Animation 的关系

Animation 不作为默认独立业务模块。动画主要归入：

- RenderObjectDefinition animations。
- Renderer Adapter 内部执行。
- Cue / Presentation 把 gameplay event 转成 render command。
- UI 动画在 react-ui 内部处理。
