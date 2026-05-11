# TCA 模块设计

## 定位

TCA 是 Trigger / Condition / Action 数据驱动规则系统，是 GameKit 的核心资产之一。

相关包：

- `@gamekit/tca`

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

- Trigger registry
- Condition registry
- Action registry
- Rule runner
- Value resolver
- Rule compile
- Rule trace
- Event-based trigger indexing

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
