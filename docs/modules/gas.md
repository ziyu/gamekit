# GAS 模块设计

## 定位

GAS 是数据驱动 Gameplay Ability System，负责 Actor、Attribute、Tag、Ability、Effect、Cue、Clue、Cooldown、Cost。

相关包：

- `@gamekit/gas`

## 设计原则

```txt
Ability = Trigger + Conditions + Actions
Effect = Duration + Modifiers + Periodic Actions
Clue = Reveal Conditions + OnReveal Actions
```

GAS 建立在 TCA 上，不重新发明规则系统。

## Actor

Actor 定义长期方向：

```ts
export type ActorDefinition = {
  id: string;
  name: string;
  tags?: string[];
  attributes?: Record<string, number>;
  abilities?: string[];
  presentation?: {
    renderObject?: string;
    portrait?: AssetRef;
  };
};
```

Actor runtime state：

- base/current attributes
- tags
- active effects
- cooldowns
- ability state

## Ability

```ts
export type AbilityDefinition = {
  id: string;
  name: string;
  activation: TriggerConfig;
  conditions?: ConditionConfig[];
  effects?: ActionConfig[];
  cues?: CueDefinition[];
};
```

Ability 激活可编译为 TCA rule。

## GameplayEffect

```ts
export type GameplayEffectDefinition = {
  id: string;
  duration?: number;
  modifiers?: AttributeModifier[];
  periodicActions?: ActionConfig[];
  tagsGranted?: string[];
  tagsBlocked?: string[];
};
```

Effect tick 走 runtime/system；复杂触发走 TCA/EventBus。

## Cue / Presentation

Cue 描述表现意图，不决定 gameplay 结果。

示例：

- floating text
- screen shake
- animation.play
- particles.emit
- ui.toast

Cue 可以转成 Renderer command、Camera command 或 UI action。

`@gamekit/fx` 不作为默认独立业务包。Cue/Presentation 由 GAS、Renderer、UI、Camera 共同消费。

## Clue

Clue 是可揭示信息或条件线索。

建议结构：

- id
- tags
- reveal conditions
- onReveal actions
- presentation

## Trace

GAS trace 需要能关联：

- ability activation
- compiled TCA rule
- applied effect
- periodic action
- cue dispatch
- attribute/tag state change

## 与 DataPack 的关系

Actor、Ability、Effect、Clue 都由 DataPack 注册和校验。引用关系必须在 DataPack load 阶段检查。
