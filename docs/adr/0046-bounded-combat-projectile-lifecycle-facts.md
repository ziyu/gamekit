# ADR 0046: Bounded Combat Projectile Lifecycle Facts

Status: Accepted on 2026-07-28.

## Context

Combat 已经通过 `combat.projectile_spawned` 与 `combat.projectile_despawned` 暴露 projectile
lifecycle，但原协议存在两个问题：spawn 直接广播完整 `CombatProjectileState`，despawn 只包含
`projectileId/entityId/reason`。前者把 payload、query、source metadata 和 hit memory 等 runtime
内部状态带进低频事件流；后者在 World entity 销毁后失去了最终位置、速度与 impact 候选，表现层无法可靠
区分 world blocker、actor hit、expire 与 cancel，也无法从已经销毁的 component 补读权威空间事实。

Outpost 需要 world impact、shield/health hit、kill confirm 和网络 cue projection，但这些不是某个游戏的
特例。任何使用 entity-backed projectile 的游戏都需要在不复制 Physics query 或 Combat runtime state 的
前提下消费同一组生命周期事实，因此不能由 app 监听内部 component 或重新执行 query 补齐。

## Decision

### Combat 输出独立的有界 fact

`combat.projectile_spawned` 的 payload 固定为 `CombatProjectileSpawnFact`：

- runtime、projectile、entity、definition、source actor/entity 与 execution identity；
- 初始 position、velocity、spawn/expire time；
- correlation 与 parent identity。

`combat.projectile_despawned` 的 payload 固定为 `CombatProjectileDespawnFact`：

- 同一组可用的稳定 identity 与明确 `reason`；
- World entity 销毁前采样的 `finalPosition/finalVelocity`；
- 仅在 collision 导致 cleanup 时携带可选 `CombatProjectileImpactFact`。

Impact fact 只包含 `target | blocker` disposition、point、normal、distance，以及 actor/entity/body/collider
稳定身份。它不携带完整 `PhysicsQueryResult`、fraction、inside、sensor、candidate list、relationship
policy、Combat payload、source metadata、tags、query 或 hit memory。

### 销毁前投影，销毁后派发

Projectile controller 在调用 `world.despawn()` 前复制 final transform、velocity 和可选 impact，然后清理
Combat/World ownership并同步派发 fact。这样 listener 不能依赖已销毁 entity，fact 也不共享 Physics
adapter 或 World component 的可变对象。Impact、hit-limit 与 bounce-limit 保留触发 cleanup 的最后一个
候选；expire、out-of-bounds、execution-ended、cancel、checkpoint restore 和 runtime dispose 只携带可用
final state，不伪造 collision。

### Event 与 Trace 保持不同成本层级

`CombatEventPolicy.emitProjectiles` 继续由上层配置，关闭后不投影或派发 projectile lifecycle event。
连续 transform 仍留在 World/Physics 高频状态，不进入 EventBus。Combat trace 只记录 reason、稳定 identity
和是否存在 impact 的摘要，不复制完整 lifecycle payload；需要网络复制或表现历史的 app 自行把 fact 投影
为具有独立 hard limit 和 watermark 的领域流。

### 测试与 benchmark 是协议的一部分

Combat 契约测试必须覆盖 impact、expire、custom cancel、unsubscribe 与真实 Rapier sweep，并断言生命周期
payload 不含 runtime/query 私有字段。

`combat-entity-churn` benchmark 必须在 projectile event 真实开启时运行 300 个 spawn/cancel × 20 轮：

- spawn 与 despawn fact 数必须精确相等；
- p95 每轮不超过 25ms，max 不超过 75ms；
- 两类 fact 的最大抽样 JSON payload 不超过 768 bytes；
- unsubscribe 后回调数为 0；
- runtime dispose 后 projectile component 留存为 0。

这些是数量级回归预算，不替代 profiler，也不要求不同机器复现毫秒级细微差异。

## Consequences

Positive consequences:

- App 和 multiplayer projection 可以在 entity 已销毁后可靠生成 world impact、hit reaction 与 cleanup cue。
- EventBus payload 大小不再随 projectile payload/query/source metadata 增长。
- GAS Cue 继续表达“播放什么”，Combat fact 只表达权威空间结果，没有建立第二套 Cue registry。
- Event、listener 和 World ownership 的性能与留存都有可执行预算。

Costs and constraints:

- `combat.projectile_spawned` 从完整 runtime state 收敛为新的公共 fact，是 alpha 阶段有意的 payload 修正；
  需要完整 state 的工具必须使用 `getProjectile/listProjectiles/snapshot`，不能依赖事件快照。
- Despawn fact 的 final transform 是销毁前最后一个权威 World sample，不承诺等于 collision point；表现应优先
  使用 `impact.point`，缺失时再回退 `finalPosition`。
- Contact backend 如果不提供 point/normal，只能稳定提供已有的 subject identity 与 distance；Core 不合成伪
  normal。

## Rejected Alternatives

### 让 Outpost 在销毁前缓存 projectile component

Rejected because app 会依赖 Combat system order 和内部 component，并且每个游戏都要重写相同的 race、
cleanup 与 correlation 逻辑。

### 在 despawn event 中附带完整 PhysicsQueryResult 或 CombatProjectileState

Rejected because payload 会暴露 adapter/runtime 私有字段，大小随 query、metadata、payload 与 hit memory
增长，也会诱导网络层直接复制内部状态。

### 把 impact 全部转换成 GAS Cue

Rejected because miss、blocker、bounce 与 expire 不一定产生 GAS effect；GAS Cue 是表现语义，不能成为
Physics 空间事实的替代品。

## Documentation

稳定契约同步维护在：

- `docs/architecture.md` 的 Combat/GAS/表现边界；
- `docs/modules/combat.md` 的 projectile lifecycle fact、测试与 benchmark 最佳实践；
- `docs/best-practices.md` 的高频状态与低频有界事实分层。

Outpost 的消费与验收状态记录在
`docs/implementation/outpost-siege-player-experience-rebuild.md`。
