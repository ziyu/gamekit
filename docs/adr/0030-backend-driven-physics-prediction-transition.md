# ADR 0030: Backend-driven Physics Prediction Transition

Status: Accepted on 2026-07-15.

Scope clarification: ADR 0047 keeps this transition as the lightweight single-subject/static-layout tier. Predicted
spawn、kinematic projectile record 和 multi-body prediction-island resimulation 不属于本 ADR 的能力声明。

## Context

Managed client replication 已经统一 input pacing、rollback/replay、字段表现插值与 correction smoothing，但 `applyInput` 仍可能使用与 authority 不同的运动模型。Outpost Siege 的 authority 通过 Rapier 以 60 Hz 子步处理 damping、静态碰撞和滑动，客户端最初却用 `position += velocity * step`。即使两端同为 20 Hz input/ack，这种模型差异仍会在普通移动和接触静态物体时持续产生 correction；增加 lerp 只能掩盖错误，不能让预测收敛。

把 Rapier 或 Outpost 场景规则写进 Multiplayer Core 会破坏领域边界。让每个游戏复制 physics scene、rollback reset、sub-step 与 dispose 逻辑又会形成 app-local 平行基础设施。真实接触测试还暴露了一个 solver 约束：普通数值 state 可以从 authoritative position/velocity 重算 pending inputs，但 Rapier 的 manifold/contact cache 不能只靠 body state 完整回滚。每份 snapshot 都强制把 speculative scene 从未来位置拉回 ack 边界，会让原本一致的碰撞预测反而分叉。

## Decision

- Multiplayer Core 的 prediction buffer 接受可选的 `transition` factory，作为低层 `applyInput` callback 的标准可复用替代。每个 buffer/binding 创建独立 transition；Core 在 authority binding reset、prediction disable 和 replication dispose 时自动释放它。游戏不能同时配置 `applyInput` 与 `transition`。
- Physics Core 提供 `createPhysicsBodyPredictionTransition(...)`。它只依赖 `PhysicsBackendAdapter`、稳定 body/collider/scene definition 和 typed state/input mapping；不依赖 Multiplayer、Renderer、World implementation 或具体 backend。
- Physics transition 为一个本地预测 subject 持有独立 backend scene。普通 predict 只在 rollback state 与 scene transform 确实不同时同步 position/rotation，再应用游戏声明的 input-to-body patch、按配置的 fixed sub-step 推进，并把 `PhysicsBodyState` 写回 predicted state。Static environment 与 subject collider 使用同一 Physics Core definition，不从表现图片推断。
- Transition 以 sequence 为键保存有界 before/after body checkpoint。Reconciliation replay 的输入基线与 checkpoint 一致时，直接复用已算出的 after state，不移动或重复 step 当前 solver scene；真正不一致时才执行 rewind/replay。`maxCachedFrames` 约束空间，`cachedReplays`、`replayCacheMisses` 和 `cachedFrames` 进入标准 transition diagnostics，并由 Multiplayer prediction diagnostics 只读透传。
- `createPhysicsLayoutDefinitions(...)` 成为 `physics.layout` 的公共 definition 解析入口。World layout module 与 prediction scene 复用同一解析结果和 stable id 规则，避免权威场景与预测场景各维护一份 collider placement。
- Backend 初始化仍属于 app/profile 组合层。Outpost Browser 动态加载 Rapier 2D adapter，并只把 `PhysicsBackendAdapter` 传入 gameplay runtime；app 不访问 Rapier native object。
- 游戏仍负责不可推断的控制语义，例如输入如何生成期望速度、aim 如何更新 facing、哪些动态对象进入预测环境。Physics Core 不加入 move speed、player、cover、team 或 ability 概念。

## Consequences

Positive consequences:

- 标准物理移动预测与 authority 使用同一 backend、body damping、shape 和静态 layout，reconciliation 不再周期性修正一个错误的线性近似。
- Multiplayer Core 自动拥有 transition lifecycle；重连、换 authority 或离开 session 不会保留旧 solver scene。
- Physics helper 同时适用于 2D/3D 和未来 backend；Outpost 只提供内容 definition 与控制映射，没有 app-local solver、collision 特判或 interpolation 调用。
- Layout definition 解析一次定义、两种 materialization，碰撞体与权威场景的资源工作流保持一致。
- 正常 snapshot ack 不再每次破坏 speculative solver 的接触历史；reconciliation 仍保留真正模型分叉时的校正能力。

Costs and constraints:

- 每个预测客户端增加一个轻量本地 physics scene；必须用 benchmark 约束 scene boot、每 input 子步和 dispose 成本，并避免复制无关动态实体。
- 不同 backend 只有在相同 definition、fixed step、input interval 和控制 patch 下才会近似收敛。Backend 不声明 deterministic 时，仍需 authority reconciliation；该 helper 不承诺 bit-level lockstep。
- Checkpoint cache 只保存公开 body state，不声称序列化完整 backend solver。它用于避免对已经验证一致的 prediction 做无意义 rewind；cache miss 仍需 authority correction，不能被解释为完整物理存档。
- 当前 subject helper 只预测一个主要 body 和配置的 environment。玩家间动态碰撞、载具、多 body character 或技能产生的瞬时 collider 需要通过后续可复用 environment sync/compound transition 扩展，不能在 Multiplayer Core 写业务分支。

## Rejected Alternatives

### Increase correction smoothing duration

Rejected because它只把持续模型误差变成更慢的视觉追赶，并增加输入延迟感。

### Put Rapier stepping in Multiplayer Core

Rejected because Multiplayer Core 只能拥有 prediction/ack/rollback 语义，不能依赖 Physics Core 或具体 backend。

### Keep an Outpost-only prediction scene

Rejected because scene lifecycle、layout materialization、sub-step 和 rollback sync 都是跨游戏可复用基础设施；Outpost 只能保留控制与内容配置。

## References

- ADR 0028: `docs/adr/0028-managed-client-replication-runtime.md`
- ADR 0029: `docs/adr/0029-declarative-prediction-state-presentation.md`
- Multiplayer module: `docs/modules/multiplayer.md`
- Physics module: `docs/modules/physics.md`
- ADR 0047: `docs/adr/0047-selective-network-prediction-and-projectile-strategies.md`
