# TCA 模块设计

## 定位

TCA 是 Trigger / Condition / Action 数据驱动规则系统，是 GameKit 的核心资产之一。

相关包：

- `@gamekit/tca`

包归属：

- TCA 是 Game Module，不是 App Host 标准服务。
- App Host 可以提供 DataRegistry、GameRuntime 创建入口、标准游戏模块装配和 DevTools shell，但不直接拥有 TCA runtime。
- TCA 应通过 `createTcaModule(...)` 这类标准 GameModule helper 无痛安装，避免每个 app 手写 EventBus 订阅、rule compile、trace store 和 cleanup。

首选启动方式：

```ts
const modules = [
  createTcaModule({
    dataRegistry,
    definitions,
    traceStore
  }),
  createGameSpecificModule()
];
```

使用 App Host 时，普通 app 应优先通过 `profile.standard.game.standardModules.tca` 启用 TCA。App Host 只负责把配置解析成 GameModule 并传给 runtime factory；TCA runtime lifecycle 仍归 GameRuntime module cleanup 管理。

底层 `createTcaRuntime(...)` 仍保留给测试、工具和高级集成；普通游戏应优先使用 GameModule 入口。

## Rule 数据结构

```ts
export type TcaRule = {
  id: string;
  trigger: TriggerConfig;
  conditions?: ConditionConfig[];
  actions: ActionConfig[];
  priority?: number;
  once?: boolean;
  enabled?: boolean;
};

export type TriggerConfig = {
  type: string;
  args?: Record<string, unknown>;
};

export type ConditionConfig = {
  type: string;
  args?: Record<string, unknown>;
};

export type ActionConfig = {
  type: string;
  args?: Record<string, unknown>;
};
```

## 核心能力

- Trigger registry。
- Condition registry。
- Action registry。
- Rule runner。
- Rule compile。
- Rule trace。
- Event-based trigger indexing。

当前公共入口：

```ts
createTcaRuleDataType();
createTcaRuntime({ rules, eventBus, definitions, traceStore, dataRegistry, game });
createTcaModule({ dataRegistry, definitions, traceStore });
createTcaTraceStore({ limit });
```

首轮内置：

- `event.type` trigger。
- `event.emit` action。

`handlers` 是 `definitions` 的兼容命名别名；长期文档和新代码使用 `definitions`。

Value Resolver 是长期能力，首轮暂不实现通用表达式语言，handler 直接解释自己的 `args`。

## Runtime / Module 边界

TCA runtime 负责：

- 编译 rules。
- 按 event type 建索引。
- 执行 condition / action handler。
- 写入 trace。
- 提供 dispose 清理内部状态。

TCA GameModule 负责：

- 从 DataRegistry 读取 `tca.rule` DataType。
- 创建并持有 TcaRuntime。
- 订阅 EventBus。
- 在 GameRuntime dispose 时取消订阅并释放 TcaRuntime。
- 可选注册低频 system，用于 tick trigger 或 deferred action queue。

GameRuntime 不直接理解 TCA；它只安装 GameModule 并在 dispose 时清理模块。

## Definition Registry

TCA 的 Trigger、Condition、Action 都是可注册 definition：

```ts
export type TcaTriggerDefinition = {
  type: string;
  description?: string;
  schema?: unknown;
  eventTypes?(config: TriggerConfig): string[];
  matches(ctx: TcaHandlerContext, config: TriggerConfig): boolean;
};

export type TcaConditionDefinition = {
  type: string;
  description?: string;
  schema?: unknown;
  evaluate(ctx: TcaHandlerContext, config: ConditionConfig): boolean;
};

export type TcaActionDefinition = {
  type: string;
  description?: string;
  schema?: unknown;
  execute(ctx: TcaHandlerContext, config: ActionConfig): void;
};
```

内置 definitions 与外部 definitions 在 runtime 创建时合并并检查重复 type。具体游戏、GAS、AI director、quest、dialogue、editor command 等模块都可以提供自己的 trigger/condition/action；TCA core 不应该硬编码这些业务类型。

## Handler Context

Handler 只通过上下文访问稳定能力：

```ts
export type TcaHandlerContext = {
  event: GameEvent;
  eventBus: EventBus;
  dataRegistry?: DataRegistry;
  game?: GameInstallContext;
  rule: TcaRule;
};
```

Handler 不应直接导入具体 renderer、Phaser、DOM 或具体游戏 app。需要表现层行为时，优先发出低频 EventBus fact，或调用由 game module 注入的稳定 bridge。

## Event Trigger Index

TCA 不应每次事件扫描所有规则。

```txt
rulesByEventType:
  hero.enter_tile:
    - rule.hero-enter-forest
    - rule.hero-enter-building
  ability.activated:
    - rule.trigger-passive-effects
```

## 预编译

加载 DataPack 时将规则预编译：

```txt
TcaRule → CompiledRule
ConditionConfig → CompiledCondition
ActionConfig → CompiledAction
ValuePath → CompiledResolver
```

运行期减少字符串解析和动态查找。

## Value Resolver

初期支持：

- `$event.*`
- `$actor.*`
- `$source.*`
- `$target.*`
- 常量值

Resolver 应在 compile 阶段准备好，运行期尽量少分配。

## Trace

TCA trace 必须回答：

- 哪个事件触发了规则？
- 哪些规则匹配？
- 哪些 condition 通过或失败？
- 执行了哪些 action？
- 修改了哪些状态？
- 发出了哪些派生 event？

## 与 EventBus 的关系

EventBus 负责低频事实广播。TCA 监听 EventBus 或 command output，但不用于每帧高频逻辑。

## 与 GAS 的关系

GAS 复用 TCA：

```txt
Ability activation = Trigger + Conditions + Actions
Effect periodic action = Runtime/System + TCA action
```

GAS 不重新实现一套规则引擎。

## 最佳实践

### 模块集成

- Trigger、Condition、Action definition 应由外部模块注册并合并，TCA core 不硬编码具体游戏、GAS、UI、quest 或 renderer 行为。
- 规则在加载或 runtime 启动时预编译，运行时按 event type index 查找候选规则；不要每个 EventBus event 扫描所有规则。
- TCA module 集成负责 EventBus 订阅、DataRegistry rule loading、definition merge、trace store 和 dispose cleanup，业务代码不重复手写这套装配。
- 测试应覆盖 trigger index、definition duplicate、condition pass/fail、action error、trace ordering、unsubscribe/cleanup、DataRegistry rule loading 和与 GAS definition set 的组合。

### 模块使用

- TCA 负责低频、可解释、可追踪的规则链路，不负责 movement、camera smoothing、render sync、pathfinding 等每帧高频逻辑。
- Handler 只通过 TcaHandlerContext 访问稳定 facade。需要表现或 UI 时发低频 event/command，不直接 import Phaser、DOM、React 或具体 app。
- Condition/action 的 value resolver 尽量在 compile 阶段准备，运行时减少字符串 path 解析和临时对象。
- Trace 是 TCA 的主要可维护性工具。每次规则跳过、失败或执行都应能解释 event、rule、condition、action 和派生 event。
