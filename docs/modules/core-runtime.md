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
};
```

应用级能力：

- `input`
- `camera`
- `platform`
- `assets`
- `data`
- `tca`
- `gas`
- `ui`
- `devtools`

这些能力不进入 `game-runtime` 顶层，也不让 `game-runtime` 直接绑定具体实现。它们由 App Host 通过 service registry、lifecycle 和 bridge module 组合到应用中。长期设计见 `docs/modules/app-host.md`。

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

模块原则：

- 模块安装应可测试、可重复推理。
- 模块不得直接导入底层 adapter 私有类型。
- 模块注册顺序影响运行时行为时，必须通过文档或测试固定。

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
