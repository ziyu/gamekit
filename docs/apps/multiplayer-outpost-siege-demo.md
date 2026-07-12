# Multiplayer Outpost Siege Demo 应用设计

## 定位

Outpost Siege 是 GameKit 的复杂多人综合验证应用。它通过一局可持续游玩的 2D 俯视角合作防守与撤离游戏，验证 Room-owned server authority、字段级 Colyseus Schema、App Host/Driver 标准组合、预测与表现、完整参与者生命周期以及真实负载下的性能和内存边界。

它与 Relay Arena 承担不同职责：

- Relay Arena 保持为小规模、可快速回归的 multiplayer baseline，验证 envelope conformance、local authority 和两条 authority lane。
- Outpost Siege 承担 server-owned runtime、字段级 Schema、大量动态实体、reconnect、负载和 soak 等复杂场景。

Outpost Siege 是应用验证面，不是 Multiplayer 公共协议来源。玩家、敌人、炮塔、路障、波次、撤离和资源等概念保持 app-local；只有经过多个真实场景验证的稳定能力才允许下沉到 GameKit package。

## 游戏体验

玩家组成最多四人的小队，在前线哨站中收集共享资源、建造防御设施、抵御多波敌人，并在最终阶段启动撤离装置。完整 session 具有清晰的开始、进行和结束流程：

```txt
room setup
  -> lobby
  -> loading
  -> countdown
  -> wave
  -> intermission
  -> wave / boss
  -> extraction
  -> results
  -> rematch or room close
```

长期玩法结构包含：

- 玩家移动、瞄准、主武器射击和冲刺。
- 至少一种需要 server validation 的主动技能。
- 炮塔和路障建造，包含资源、冷却、占位和范围检查。
- 多种 server-owned 敌人行为和高压最终敌人。
- 投射物、命中、伤害、击退、死亡、复活和传送。
- 共享资源、唯一掉落物竞争和团队目标进度。
- lobby、ready、start、wave、results 和 rematch 的完整闭环。

对象数量、生命周期和同步模式优先于地图规模、美术数量或成长深度。玩法内容应足以自然产生持续输入、离散 action、动态 spawn/despawn、竞争性决策和高实体数量，但不扩展为完整商业游戏的账号、装备、商店或长期养成系统。

## 权威模型

Colyseus Room 是网络 authority 和 server simulation 的生命周期所有者。创建 room 的浏览器只取得 party leader 权限，不成为 gameplay state writer，也不持有 server simulation。

- Room 创建时启动 headless App Host、GameRuntime、World、Physics 和 replication projection。
- Fixed-step simulation、AI、碰撞、伤害、生成销毁和结果判定只在 server runtime 运行。
- Browser 只发送归一化 input/action，并消费绑定 authority endpoint 的状态。
- Party leader 可以请求开始、rematch 或关闭 room，但请求仍需 server policy 校验。
- 关闭 leader 浏览器不能终止仍有 participant 或保留 seat 的 authority simulation。
- Room close、idle timeout 或 server shutdown 统一释放 runtime、listener、timer、queue、Schema collection 和 physics scene。

Room-owned authority 与 host-authoritative Relay Arena 可以长期并存。两者共享 Multiplayer authority binding、输入语义、source gate 和 diagnostics，但拥有不同的 authority endpoint 与生命周期策略。

## Browser 组合

Browser 正式通过 configured App Host 组合以下能力：

- Phaser Driver 统一持有 renderer、asset、input source 和 camera adapter。
- Multiplayer standard service 管理 provider connection lifecycle。
- Client GameRuntime 与 Multiplayer GameModule 管低频 command、authority binding 和 presentation binding。
- Input Router 把键鼠、手柄或触控来源归一化为 game-scoped input/action。
- Prediction/reconciliation 维护本地玩家的 render-only 预测状态。
- Snapshot presentation tracks 维护远端玩家、敌人、投射物和动态对象的显示状态。
- DevTools 消费节流后的 multiplayer、game、renderer、input 和 performance diagnostics。

Phaser runtime 只能由 Driver 创建。UI、gameplay domain 和 presentation policy 不直接读取 Colyseus `Room`、`Client`、raw Schema 或 socket handle。React/DOM 只消费低频 lobby、health、score、objective、results 和 diagnostics view model；高频 transform 不驱动 DOM 每 tick 重建。

## Server 组合

每个 Outpost Siege Room 拥有独立的 headless App Host。Server GameRuntime 的 system 顺序必须显式并可诊断：

```txt
network ingress
  -> gameplay intent / AI
  -> physics sync and step
  -> contacts / combat / lifecycle
  -> replication projection
  -> Schema commit
  -> diagnostics sampling
```

Multiplayer authority helper 必须把 input/action ingress 与 authoritative state commit 分开，使 Physics 和 gameplay systems 在同一个 authority tick 内完成后才推进 snapshot/version/ack。离散 action 的 ack 不能在 simulation 消费前推进；latest continuous input 的 ack 只能在对应状态被 authoritative tick 使用后推进。

Physics 使用 `@gamekit/physics-core` 稳定协议和 `@gamekit/physics-rapier2d` headless backend。Rapier native type 不进入 gameplay domain、replication view 或 browser prediction contract。大规模对象同步必须维护 body/collider 到 entity 的有界索引，不能在每个 contact 上扫描整个 World。

## 输入与 Action

Continuous input 使用 latest-state contract：

- movement、aim 和 held-fire 每个 peer/source 只保留最新状态。
- Browser 可以按 render frame 采样，但按独立、可配置频率发送。
- neutral/release、timeout、disconnect 和 authority binding reset 都必须清空 held state。
- sequence/epoch 必须严格验证，重复、倒序、旧 epoch 和非法数值不能改变 authority state。

Discrete action 使用 per-source bounded FIFO：

- dash、ability、build、interact、ready、start 和 rematch 每份只消费一次。
- Queue 具有每 source、每 room 和每 tick 的容量与消费上限。
- accepted、rejected、overflow、coalesced 和 expired 都进入低成本 diagnostics。
- App 不维护绕过 Multiplayer helper 的无界 action 数组。

## Replication 与 Schema

高频 authority state 使用 app-owned、字段级 Colyseus Schema。Schema class 和 gameplay-to-schema mapping 位于 Outpost Siege 的 provider-specific server/client adapter 边界，不进入 `multiplayer-core` 或可复用 gameplay module。

权威数据流保持单向：

```txt
server gameplay world
  -> app-owned replication projection
  -> Colyseus Schema patch
  -> client authoritative shadow
  -> prediction / presentation values
  -> renderer target state
```

长期约束：

- 每个 room 只有一个 authoritative gameplay state path；Schema 与 envelope snapshot 不双写同一状态。
- Schema entity 使用稳定 `entityId + generation`，防止 id 重用污染旧 track、patch 或 prediction history。
- Client authoritative shadow 验证 session、source endpoint、schema version、provider version、size 和 resync 状态。
- Schema callback 只更新 authoritative shadow；renderer 在 presentation frame 批量读取投影结果。
- 初始同步可以包含完整可见状态，后续使用单调 provider version 的字段级 patch。
- AOI、interest management 和 replication partition 保持 app/server-specific，除非多个真实应用证明需要稳定公共 primitive。

## Prediction 与表现

- 本地玩家位置和速度使用 input prediction + authoritative reconciliation。
- 本地 aim 立即表现，随后接受 authority correction。
- 远端玩家、敌人和投射物默认使用 core temporal playback 与 declared `Network*` tracks。
- Health、resource、phase 和 objective 等离散事实直接读取 authority value，只允许 UI tween，不参与 gameplay prediction。
- Teleport、respawn、generation change、binding change、schema reset 和 resync 必须 snap 并清空相关 history/track。
- Presented state 只写 renderer target 或 UI view model，不能回写 authoritative shadow、gameplay world、Data 或 Save。

Outpost Siege 上层声明字段选择、track key、snap/reset policy 和最终写入，不实现平行的通用 interpolation clock、snapshot buffer 或深度对象插值器。

## 参与者生命周期

- Lobby explicit leave 立即释放 player 和 seat。
- Running explicit leave 标记 abandoned，清空输入并按玩法规则安全移除 actor。
- Transport disconnect 清空输入并进入有限 grace period；actor 使用无输入冻结策略，不默认引入 bot 接管。
- Provider reconnect 在 grace period 内恢复同一 stable peer/player binding 和新的 input epoch，不重放旧 action。
- Grace timeout 转为 abandoned。
- Running 中的新 participant 进入 spectator/next-round，在下一次 lobby/rematch 晋升 active。
- Leader disconnect 只触发权限转移，不改变 server authority。
- 最后一个 participant 和保留 seat 释放后，Room 按 server profile 立即关闭或等待有限 idle timeout。

Explicit leave、transport disconnect、provider reconnect、new join、page refresh 和 room recreate 是不同事实，UI 和测试都不能只从 active peer count 推断生命周期结果。

## Diagnostics 与性能

Client diagnostics 至少覆盖 frame、presentation、input、prediction、Schema update、network bytes 和 entity count。Room diagnostics 至少覆盖 simulation tick、queue、AI、physics、gameplay、replication、Schema patch、participants、entity churn、bandwidth、heap、GC 和 event-loop lag。

所有 diagnostics 使用固定窗口聚合和 bounded recent samples；不保留完整高频 payload、逐 tick world clone、socket、token 或无限 event history。

性能验证必须区分：

- 单客户端/多客户端浏览器表现。
- 单房 simulation 与 replication 极限。
- 多房 process throughput 和 tick fairness。
- reconnect、spawn/despawn、room recreate 和长时间运行的 retained heap。

AOI 和 projectile replication 优化必须由字段级 Schema 全量同步基线驱动。常规 PR CI 只保留确定性正确性和缩短版稳定性检查；完整压力、网络故障和 soak 由手动或定时 workflow 运行。

## 约束

- 不把 Outpost Siege 玩法类型、Schema class、AI、combat、building 或 objective 上推为 Multiplayer core API。
- 不在 browser authority shadow、presented state 和 server world 之间共享同一个可变对象。
- 不让 browser leader、UI 或 renderer 决定 authority simulation。
- 不把 live connection、seat token、Room handle、input queue、snapshot buffer、Schema collection 或 presence 保存进 Save。
- 不为 Demo 自研通用 room server、matchmaker、transport、物理引擎、rollback 或 MMO framework。
- 不在缺少性能证据时提前设计 AOI、replication contributor 或通用 partition API。
