# Combat 模块设计

## 定位

Combat 是可选的 Game Module toolkit，负责把一次语义化攻击交付为可验证的目标候选、命中结果和 GAS effect。它建立在 World、Physics 与 GAS 之上，不替代任何一个模块。

相关包：

- `@gamekit/combat`

Combat 不定义具体武器、职业、敌人、生命属性名、暴击公式或阵营枚举。游戏通过 DataType 和 policy 注入这些语义。

## 职责

- effect delivery：melee、hitscan、projectile、area、direct target。
- target relationship 与 target filter protocol。
- hit ticket、命中去重、pierce/bounce/stop policy。
- entity-backed projectile lifecycle。
- 命中、拒绝、交付、销毁 trace 和低频 fact。
- 与 GAS ability execution、Physics query/contact、World identity 的稳定关联。

非职责：

- Physics solver、碰撞 broadphase 或 pathfinding。
- GAS attribute/effect/tag/cooldown runtime。
- 武器输入、AI 决策、关卡规则、动画、音频或 UI。
- 固定的 hp/shield/team/faction/damage type 业务模型。

## 核心模型

```ts
export type CombatDeliveryRequest = {
  id: string;
  sourceActorId: string;
  sourceEntityId?: EntityId;
  executionId?: string;
  definition?: DataRef<"combat.delivery">;
  delivery?: CombatDeliverySpec;
  payloads?: CombatPayloadSpec[];
  relationshipPolicy?: string;
  targetActorId?: string;
  origin?: PhysicsVector;
  position?: PhysicsVector;
  direction?: PhysicsVector;
  correlationId?: string;
  parentId?: string;
};

export type CombatDeliverySpec =
  | { type: "direct"; targetActorId: string }
  | { type: "melee"; shape: PhysicsShapeDefinition; offset?: PhysicsVector }
  | { type: "hitscan"; range: number; radius?: number }
  | { type: "area"; shape: PhysicsShapeDefinition; position: PhysicsVector }
  | { type: "projectile"; projectile: DataRef<"combat.projectile"> };

export type CombatPayloadSpec = {
  effectId: string;
  target: "hit-actor" | "source-actor";
};
```

Combat 使用 effect id 交付玩法结果，不直接修改 `health`。伤害、治疗、控制、修复和环境交互都可以由同一 delivery path 触发不同 GAS effect。

## Target 与 Relationship

游戏注册窄 policy：

```ts
export type CombatRelationshipResolver = {
  resolve(source: CombatSubject, target: CombatSubject): string;
  allows(policyId: string, relationship: string, context: CombatHitContext): boolean;
};
```

Core 不内置 player/enemy/friendly。Physics layer 只负责 broadphase 裁剪；owner ignore、friendly fire、无敌、死亡、目标类型和 phase restriction 在 relationship/target policy 中解释。

候选排序必须稳定。`closest`、`all`、`maxTargets`、目标优先级和 tie-breaker 由 delivery definition 明确，不能依赖 backend 返回顺序。

`PhysicsQueryResult.entityId` 是可选加速信息，不是所有 backend 都会填充。Combat 必须以同一 World 中的 Physics body/collider component 为身份事实源，在一次 query 或 projectile batch 内建立有界索引，把 body/collider id 映射回 entity，再查询 GAS actor；不能要求 adapter 复制一套 entity registry，也不能为每个候选全量扫描 World。

## Projectile

Projectile 是 World entity，可以同时具有：

- stable gameplay id 与 network generation。
- `CombatProjectileComponent`。
- Physics body/collider/transform/velocity component。
- presentation definition reference。

Projectile definition 至少描述：

```ts
export type CombatProjectileDefinition = {
  id: string;
  body: DataRef<"physics.body">;
  lifetimeMs: number;
  speed?: number;
  collisionMode: "contact" | "ray-sweep" | "shape-sweep";
  hitPolicy: "stop" | "pierce" | "bounce";
  maxHits?: number;
  maxBounces?: number;
  repeatHitCooldownMs?: number;
  payloads: CombatPayloadSpec[];
};
```

高速小投射物默认使用 ray/shape sweep，避免固定步之间 tunneling。具有实际体积的弹体优先 shape cast；backend 原生 CCD 只能作为 adapter capability，不替代公共 hit policy。

每个投射物维护有界 hit memory。`maxHits`、`maxBounces`、lifetime 和 arena bounds 都是硬上限；任何配置都不能产生无界命中集合或永久 entity。

Projectile module 使用批量 query、复用临时结果与延迟 cleanup queue，避免在 entity 循环内创建大量 Set/Array。是否使用 entity pool 由 World adapter benchmark 决定，公共协议不暴露池化 identity。

## Ability Execution 协作

GAS 负责 ability phase、cost、cooldown、tag gate 和取消。Combat 只在 execution 进入 `committed` 或指定 active marker 时接收 delivery request：

```txt
input / AI intent
  -> GAS execution requested
  -> preparing
  -> committed
  -> Combat delivery spawn/query
  -> Physics candidate
  -> relationship + target validation
  -> GAS effect application
  -> hit result / cue / trace
  -> recovery / completed
```

Combat 不能自行推进 ability execution，也不能从动画 frame 推断 commit 时刻。Execution 被取消后，已经生成的 projectile 是否继续存在由 definition 的 ownership policy 决定。

可复用集成使用 `combat.ability-delivery` 数据定义把一个 GAS Ability 映射到一个或多个 Combat Delivery：

```ts
export type CombatAbilityDeliveryDefinition = {
  id: string;
  ability: DataRef<"gas.ability">;
  delivery: DataRef<"combat.delivery">;
  phase?: "committed";
  tags?: string[];
};
```

`createCombatModule(...)` 可选择启用 ability delivery bridge。Bridge 监听 GAS execution phase fact，在匹配的 authority execution 首次进入 `committed` 时自动构造幂等 delivery request，传播 actor、target、execution、correlation 和 parent，并调用同一个 module-bound Combat runtime。静态 origin/direction/position 可以来自 delivery definition；需要实时瞄准、蓄力或武器 socket 的游戏通过窄 `resolveRequest` policy 为 request 补充上下文，而不是重写订阅、幂等和 trace 流程。没有配置 bridge 时，保留显式 `combat.deliver(...)` 给环境伤害、脚本事件和测试工具使用。

Bridge 不属于 GAS：GAS 不能依赖 Combat data type，也不能知道 melee、hitscan、projectile 等 delivery 语义。Bridge 也不创建第二个 GAS/Combat runtime，不扫描 execution snapshot，不以每帧 polling 代替 phase event。

## Cue 与空间事实

Combat 不定义平行的通用 Cue 系统。一次成功命中通过 GAS `applyEffect(...)` 触发 Effect Cue；Ability 的前摇、释放和恢复仍由 GAS execution Cue 表达。

Combat 只补充表现需要、但 GAS Cue 不应承载的动态事实：

- delivery request、命中 ticket 和 execution 的稳定关联。
- hit point、normal、distance、blocker 与查询路径结果。
- projectile entity、transform、spawn/hit/bounce/expire/despawn lifecycle。
- miss、cover block、bounce 和 expire 等没有成功 Effect 的空间结果。

Projectile lifecycle 使用两个独立的有界 payload：

```ts
export type CombatProjectileSpawnFact = {
  runtimeId: string;
  projectileId: string;
  entityId: EntityId;
  definitionId: string;
  sourceActorId: string;
  sourceEntityId?: EntityId;
  executionId?: string;
  position: PhysicsVector;
  velocity: PhysicsVector;
  spawnedAt: number;
  expiresAt: number;
  correlationId?: string;
  parentId?: string;
};

export type CombatProjectileDespawnFact = {
  runtimeId: string;
  projectileId: string;
  entityId: EntityId;
  reason: string;
  definitionId?: string;
  sourceActorId?: string;
  sourceEntityId?: EntityId;
  executionId?: string;
  finalPosition?: PhysicsVector;
  finalVelocity?: PhysicsVector;
  impact?: {
    disposition: "target" | "blocker";
    subject: { actorId?: string; entityId?: EntityId; bodyId?: string; colliderId?: string };
    point?: PhysicsVector;
    normal?: PhysicsVector;
    distance?: number;
  };
  correlationId?: string;
  parentId?: string;
};
```

`combat.projectile_spawned` 与 `combat.projectile_despawned` 分别派发上述 fact。Despawn 在 World entity
销毁前复制 final state；collision cleanup 保留最后一个候选的有界 impact，非 collision cleanup 不伪造
impact。Fact 不包含完整 projectile state、query/candidate、payload、tags、metadata 或 hit memory；需要读取
当前完整状态的工具使用 `getProjectile/listProjectiles/snapshot`。连续 transform 仍只存在于 World。

表现组合层通过 EventBus envelope 的 `correlationId/parentId` 以及 execution、ticket、projectile id，把 GAS Cue 的“播放什么”与 Combat fact/World state 的“在哪里、沿什么方向播放”关联起来，再交给 Animator、Renderer、Audio、Camera 或 UI。Combat fact 不能伪装成 GAS Cue；连续 projectile transform 也不能进入低频 EventBus 流。

## 运行顺序

推荐系统顺序：

```txt
ability/task intents
  -> GAS execution phase advance
  -> combat spawn and pre-physics commands
  -> Physics fixed step
  -> projectile sweep/contact collection
  -> target validation and effect delivery
  -> GAS effect/attribute update
  -> death/down/status reactions
  -> replication projection and presentation cues
  -> lifecycle cleanup
```

命中结果在一个 authority tick 内只结算一次。Contact event、sweep result 和 explicit target 不能为同一个 hit ticket 重复应用 effect。

## Data、Save 与 Multiplayer

- `combat.projectile`、`combat.delivery` 和可选 `combat.relationship-policy` 通过 DataRegistry 校验引用。
- Save 只保存仍需跨 checkpoint 存活的 projectile state、hit count、lifetime 和 stable identity；不保存 query result、contact cache 或 presentation cue。
- Multiplayer 复制 projectile/entity presentation state、公开 ability execution 与有界 hit/cue fact；客户端不重新运行 authority target validation。
- Client-only cosmetic projectile 必须明确标记为 presentation，不能与 authority projectile 共用 gameplay identity。

## Trace

Combat trace 至少覆盖：

- request accepted/rejected。
- candidate query 与裁剪数量。
- relationship/target rejection reason。
- hit ticket、effect application 与 duplicate suppression。
- projectile spawn/hit/pierce/bounce/expire/despawn。
- execution、physics、GAS 和 network correlation。

Trace 默认只保存摘要和稳定 id，不保存完整 query payload 或每帧 projectile transform。

## 最佳实践

### 模块集成

- 组合层把同一个 World、PhysicsHandle、GasHandle、identity resolver 和 DataRegistry 注入 Combat module；Combat 不创建自己的 PhysicsScene 或 GAS runtime。
- 需要由 GAS Ability 驱动 delivery 时，优先注册 `combat.ability-delivery` 并启用 Combat module 内置 bridge；只把动态瞄准或 socket 解析留给注入 policy，不在每个武器 handler 中重复监听 phase fact。
- Combat 安装顺序必须位于 intent/GAS commit 之后、Physics query 与 GAS effect resolution 的正确边界，并由 system-order test 锁定。
- Physics query adapter 可以省略 entity id；集成测试必须至少使用一个只返回 body/collider id 的真实 backend，锁定 World identity fallback。
- 新 delivery executor 通过统一 conformance 覆盖 target filtering、stable ordering、duplicate suppression、cleanup、trace 和 error code。
- benchmark 至少覆盖大量 projectile sweep、area query、pierce hit memory、entity churn 和 dispose retained state。
- Lifecycle event benchmark 必须真实开启 `emitProjectiles`，同时约束 spawn/despawn数量、p95/max、fact序列化大小、unsubscribe后回调和 dispose retained state；关闭事件的 hot-path benchmark不能替代该预算。

### 模块使用

- 普通 Ability 通过 `combat.ability-delivery` 映射到 delivery；环境伤害、脚本和工具可以显式构造 `CombatDeliveryRequest`。两条入口必须复用同一个 runtime，不在每个武器 handler 中复制 raycast、owner ignore、effect apply 和 trace。
- 具体伤害公式、队伍关系、核心/设施规则通过注入 policy 实现，不向 Combat Core 增加游戏枚举。
- 动画、音频和镜头以 GAS Cue 为表现语义源，并按需关联 Combat 空间 fact；它们不反向决定 hit result。
- 高频 projectile transform 和 candidate list 留在 World/Physics/Combat runtime，不进入 React、EventBus 或完整网络 fact stream。
- 表现优先使用 `despawn.impact.point`；只有 backend 未提供 collision point 时才回退 `finalPosition`。消费者不能在收到 despawn 后反查已销毁 entity。
