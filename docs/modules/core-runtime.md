# Core / Runtime 模块设计

## 定位

Core / Runtime 是 GameKit 的薄内核。它只提供稳定协议、低层工具和生命周期组合，不承载具体玩法、渲染、资源加载、输入或 UI 实现。

相关包：

- `@gamekit/core`
- `@gamekit/event-bus`
- `@gamekit/game-runtime`

## `@gamekit/core`

职责：

- `Registry<T>`
- `GameModule` / `defineGameModule`
- `Clock`
- Seeded RNG
- `GameError`
- `Result`
- 通用 ID / logger 等基础工具

原则：

- 不依赖具体游戏 app。
- 不依赖 Koota、Phaser、React、Tauri 等第三方实现。
- 错误需要稳定 `code` 和上下文。
- Registry 默认重复注册和缺失读取都抛明确错误。

## `@gamekit/event-bus`

职责：低频 gameplay/runtime event。

事件结构：

```ts
export type GameEvent<TPayload = unknown> = {
  type: string;
  payload: TPayload;
  timestamp: number;
  source?: string;
};
```

适合进入 EventBus：

- actor.created
- actor.died
- hero.enter_tile
- ability.activated
- effect.applied
- clue.revealed
- asset.loaded
- runtime.started

不适合进入 EventBus：

- 每帧 position 更新。
- 每帧 render object patch。
- 高频 pointer move。
- 大量 input raw event。

## `@gamekit/game-runtime`

职责：

- 安装 GameModule。
- 管理 world、eventBus、clock、rng。
- 注册和执行 systems。
- 提供 `start()`、`stop()`、`tick(delta)`。
- 释放 GameModule 安装时注册的订阅、桥接和内部 runtime。

长期方向：

```ts
export type GameRuntime = {
  world: GameWorld;
  eventBus: EventBus;
  clock: Clock;
  rng: Rng;

  start(): void;
  stop(): void;
  tick(delta: number): void;
  dispose(): void;
};
```

应用级能力：

- `input`
- `platform`
- `assets`
- `data`
- `ui`
- `devtools`

这些能力不进入 `game-runtime` 顶层，也不让 `game-runtime` 直接绑定具体实现。它们由 App Host 通过 service registry、lifecycle 和 bridge module 组合到应用中。长期设计见 `docs/modules/app-host.md`。

游戏会话能力：

- `camera`
- `tca`
- `gas`
- gameplay save capture / restore
- gameplay-specific UI binding

这些能力不进入 `game-runtime` 顶层，但应优先通过标准 GameModule helper 安装，而不是让每个 app 手写 EventBus 订阅、system 注册和 cleanup。

## GameModule

GameModule 是功能安装单位。

模块可以注册：

- Components
- Systems
- TCA triggers / conditions / actions
- GAS definitions
- Data loaders
- UI windows
- Asset loaders
- DevTools panels

长期安装协议：

```ts
export type GameModule<TInstallContext = unknown> = {
  id: string;
  install(ctx: TInstallContext): void | GameModuleCleanup | GameModuleDisposable;
};

export type GameModuleCleanup = () => void;

export type GameModuleDisposable = {
  dispose(): void;
};
```

`install()` 可以返回 cleanup。GameRuntime 在 `dispose()` 时按模块安装反序执行 cleanup。`stop()` 只停止 tick，不释放模块订阅；`dispose()` 释放 EventBus 订阅、adapter bridge、trace runtime、camera controller runtime 等长期句柄。

模块原则：

- 模块安装应可测试、可重复推理。
- 模块不得直接导入底层 adapter 私有类型。
- 模块注册顺序影响运行时行为时，必须通过文档或测试固定。
- 标准模块 helper 应隐藏重复装配，例如 TCA 的 EventBus 订阅和 trace store lifecycle、Camera 的 input action 绑定和 renderer adapter sync。

## Tick 边界

Tick 顺序：

```txt
update runtime clock
→ execute systems in registration order
→ emit low-frequency diagnostics if needed
```

要求：

- `stop()` 后 system 不执行。
- 高频逻辑放 system。
- 中低频事实通过 EventBus。
- React 不进入主循环。

## 最佳实践

### 模块集成

- GameRuntime 集成只负责模块安装、clock、system tick、start/stop/dispose 和低频 runtime event，不负责 boot App Service 或创建外部 runtime。
- 标准 GameModule helper 应隐藏重复装配，例如 TCA 的 EventBus 订阅和 trace store lifecycle、Camera 的 input action 绑定和 renderer adapter sync。
- GameRuntime 的 system 注册顺序是行为契约。新增标准模块 helper 时，如果顺序影响结果，必须用测试固定，并在模块设计中说明依赖。
- GameModule `install()` 应只做注册和订阅，不隐式启动外部 runtime；订阅、interval、adapter bridge 和 trace store cleanup 必须在 GameRuntime dispose 时释放。

### 模块使用

- `@gamekit/core` 只放低层通用工具，例如 Registry、Clock、Result、GameError、seeded rng 和 GameModule 类型；不要把 renderer、input、asset、platform、TCA、GAS 或具体游戏概念塞进 Core。
- Registry、Clock、GameError 等基础工具的错误消息要稳定、可测试、可定位，避免为了方便返回 `undefined` 后让调用方在更远处失败。
- EventBus 事件应表达已经发生的低频事实，事件 payload 保持小而可序列化；不要用 EventBus 广播每帧 transform、raw pointer move、held input 或 render patch。
- `start()`、`stop()`、`tick()`、`dispose()` 的边界要清楚：`stop()` 不释放模块，`dispose()` 释放长期句柄，`tick()` 不应该悄悄 boot app service。
- 测试优先覆盖 lifecycle、重复安装、system 顺序、stop 后不执行、dispose cleanup、clock restore 和错误路径。
