# GAS 模块设计

## 定位

GAS 是通用 Gameplay Ability System，负责 Actor、Attribute、Tag、Ability、Effect、Cue、Clue、Cooldown、Cost 和 trace。它不是只服务 RPG/ARPG 的战斗系统，而是面向多类型游戏的玩法状态与规则执行层。

相关包：

- `@gamekit/gas`

包归属：

- GAS 是 Game Module，不是 App Host Service。
- GAS 可以依赖 `@gamekit/world` facade，以便把高频运行时状态放进 ECS component。
- GAS 不依赖 Koota、Phaser、React、Tauri 或具体游戏 app。
- App Host 可以提供标准游戏模块入口，负责把 GAS module 注入 GameRuntime，但不把 GAS runtime 暴露成应用服务。

## 设计原则

```txt
Ability = activation + costs + cooldown + conditions + effects + cues
Effect = instant changes + duration + modifiers + periodic changes + tags
Cue = presentation intent, not gameplay result
Trace = explain ability/effect/state/cue chain
```

GAS 建立在 Data、World、TCA 之上：

- DataRegistry 管 Actor / Ability / Effect / Attribute / Tag / Cue 定义。
- World component 承载常见 actor 的运行时热数据。
- TCA 提供低频 trigger / condition / action 规则扩展。
- GAS Runtime 负责解释定义、操作 ECS-backed actor state、派发 cue 和记录 trace。

## Entity 与 Actor

常规游戏对象应优先使用 entity-backed actor：

```txt
World Entity
  ├─ GasActorComponent
  ├─ GasAttributesComponent
  ├─ GasTagsComponent
  ├─ GasAbilitiesComponent
  └─ GasEffectsComponent
```

这样移动、战斗、光环、Buff、查询等热路径能利用 ECS 查询和组件局部性。`@gamekit/gas` 只能依赖 `@gamekit/world` facade，不能依赖具体 ECS。

Actor 仍不等同于 Entity。长期模型必须同时支持：

- entity-backed actor：单位、怪物、建筑、投射物、区域触发器。
- detached actor：关卡导演、队伍、天气、全局剧情状态、经济系统、叙事线索。

推荐绑定结构：

```ts
export type GasActorComponentState = {
  actorId: string;
  definitionId: string;
  entityId?: EntityId;
};
```

`actorId` 可以等于 `entityId`，但不强制。业务模块负责在 entity despawn、save/load、场景切换时决定 actor 的移除、冻结或迁移策略。

## Data Definitions

GAS 数据定义保持游戏类型无关：

- `GasActorDefinition`
- `GasAttributeDefinition`
- `GasTagDefinition`
- `GasAbilityDefinition`
- `GasEffectDefinition`
- `GasCueDefinition`

Attribute 使用通用 key-value，不写死 hp/mp/stamina。Tag 是通用状态事实，不写死 buff/debuff。Ability 是可激活行为，不等同于技能按钮。Effect 是状态变化与持续行为的统一表达。

## Ability

Ability 激活流程：

```txt
activation request
→ actor/target resolution
→ tag requirement / blocked tag
→ cost check
→ cooldown check
→ apply effects
→ emit cues/events
→ write trace
```

Ability 可以由输入、AI、TCA rule、剧情、回合开始、区域进入、碰撞、计时器或任意低频事件触发。高频逐帧逻辑不应通过 TCA 扫描规则完成。

## Effect

Effect 支持：

- instant effect
- duration effect
- periodic effect
- attribute modifier
- granted / removed tags
- stack policy
- expire cleanup

首层协议不绑定具体战斗类型。伤害、治疗、建筑增益、区域 aura、生产效率、剧情标记、天气影响都应能用同一套 Effect 模型表达。

## TCA 集成

GAS 复用 TCA，不重新实现规则系统。GAS 自己提供 TCA definitions，例如：

- `gas.actor.has_tag`
- `gas.attribute.compare`
- `gas.activate_ability`
- `gas.apply_effect`
- `gas.modify_attribute`

这些 definitions 由 GAS package 提供，TCA core 不硬编码 GAS 业务。普通 app 通过 App Host 标准游戏模块或 `createGasModule(...)` + `createTcaModule(...)` 组合启动。

## Cue / Presentation

Cue 描述表现意图，不决定 gameplay 结果。

示例：

- floating text
- screen shake
- animation.play
- particles.emit
- sound.play
- ui.toast

GAS 不直接调用 Renderer、Camera、Audio 或 UI adapter。Cue 通过 EventBus、Renderer command bridge、UI action bridge 或后续 DevTools 被消费。

`@gamekit/fx` 不作为默认独立业务包。Cue/Presentation 由 GAS、Renderer、UI、Camera 共同消费。

## Trace

GAS trace 需要能关联：

- ability activation / rejection
- cost / cooldown / tag condition
- applied effect
- periodic action
- cue dispatch
- attribute/tag state change
- 关联的 TCA rule trace

Trace 是 GAS 的核心能力之一，因为数据驱动玩法如果不可解释，后续编辑器和 DevTools 会很难维护。

## 与 DataPack 的关系

Actor、Attribute、Tag、Ability、Effect、Cue、Clue 都通过明确的 DataType 注册和校验，例如 `gas.actor`、`gas.ability`、`gas.effect`。DataPack 可以混合这些内置类型和游戏自定义类型，例如 `game.hero` 或 `game.monster`。

GAS 不要求游戏必须按 GAS 类型组织内容文件。真实项目可以把某个 hero 的 `game.hero`、`gas.actor`、`gas.ability`、`render.object` 和 asset references 放在同一个业务文件里，也可以拆到不同 DataPack。引用关系必须在 DataPack load 阶段通过 DataRef / AssetRef 检查。
