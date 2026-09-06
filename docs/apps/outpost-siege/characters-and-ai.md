# Outpost Siege 角色与 AI

## AI 技术选择

Outpost 不为每个普通敌人运行 GOAP。默认架构为：

```txt
共享空间事实 + 个体感知记忆
  -> Utility goal selection
  -> 可中断 Task 状态机
  -> Navigation route + local steering
  -> movement / aim / GAS ability intent
```

原因：普通敌人数量高、角色目标有限、攻击过程有严格前摇/生效/后摇。Utility 适合在“攻击玩家、攻击核心、破坏设施、换位”之间评分；Task 状态机适合可靠执行 `接近 → 预兆 → 提交 → 恢复`。GOAP 的多步世界状态搜索在这里增加成本和不可控组合，却不会显著改善行为。

通用协议见 [`../../modules/ai.md`](../../modules/ai.md) 与 [`../../modules/navigation.md`](../../modules/navigation.md)。GOAP 只保留为未来 `AiPlanner` adapter 扩展点。

## 方案比较

| 方案                        | 优点                                           | Outpost 风险                                       | 决策                       |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------- | -------------------------- |
| Utility + Task HFSM         | 优先级可解释、阶段稳定、易错峰、适合大量 agent | 需要设计 consideration 与 task contract            | 默认                       |
| GOAP                        | 能动态组合多步行动                             | 每 agent planning 成本高，普通敌人没有足够规划空间 | 不用于普通敌人             |
| Behavior Tree               | 可视化和脚本生态成熟                           | 决策、执行、寻路易混成大型树，priority 抖动难解释  | 不作为 Core 默认           |
| XState                      | statechart/actor 语义完整、工具成熟            | 每 agent actor runtime 与批量 ECS hot path 不匹配  | 可用于低数量 workflow/tool |
| Yuka complete agent runtime | 具备 entity、goal、steering、navigation        | 与 World/Physics/AI Core 事实源重叠                | 不接管 authority agent     |
| Yuka algorithm adapter      | 可复用 graph/search/steering 算法              | 需要证明数据转换与性能                             | Navigation adapter 候选    |

## Agent Runtime State

每个敌人 entity 绑定一个 AI agent，热状态拆分为：

- Identity：agent id、entity id、GAS actor id、definition id。
- Perception memory：目标最后位置、观察时间、威胁、可达性、设施状态。
- Decision：current goal、score、commitUntil、nextDecisionAt。
- Task：task id、phase、target id、startedAt、timeout、path request/route id。
- Movement：preferred velocity、facing/aim、stuck progress。
- Combat：active ability execution、attack slot token。

World component 保存需要高频查询的紧凑状态；可变长度 memory、path 与 trace 由 AI/Navigation runtime 有界存储。客户端只复制 player-visible target/telegraph/execution，不复制 utility breakdown。

## 感知

### 感知来源

- Shared spatial cache：玩家、核心、设施、路障、危险区的候选与位置。
- PhysicsQueries：视线和必要 overlap/raycast。
- Gameplay facts：最近受伤 source、设施告警、供能节点状态、wave directive。
- Navigation：目标 projection/path status。

普通 agent 不对所有 World entity 做全扫描。Authority 每个感知 bucket 批量构建候选，agent 再做有限目标过滤。视线只对进入距离/角度候选的目标执行 Physics raycast。

### 记忆

玩家离开视线后，enemy 保留短期 `last-seen-position` 和 confidence。不同角色记忆时长由 data 配置：

- Raider：短记忆，容易回到核心路线。
- Gunner：中等记忆，会移动到最后视线点。
- Saboteur：主要依赖设施/节点的共享事实。
- Brute：目标承诺更长，不因轻微伤害频繁换目标。

Memory 有固定容量、TTL 和 deterministic eviction。无效 entity generation 立即清理。

## Utility Goal

基础 goal：

- `advance-to-core`
- `attack-player`
- `attack-core`
- `attack-facility`
- `disable-facility`
- `take-firing-position`
- `break-barricade`
- `retreat-from-hazard`
- `recover-from-stuck`

Consideration 示例：

- 距离/预计路径成本。
- 目标类型与角色偏好。
- 当前是否有攻击槽。
- 最近受伤 threat。
- 核心/节点危险程度。
- 目标 line of sight。
- 当前 goal commitment、task phase 与 ability cooldown。
- 附近同类 density，避免所有 agent 选择同一点。

分数 curve 在 Data load 时编译。Selector 使用 stable tie-break、minimum commitment 和 switch threshold。普通 Raider 不会每 100 ms 在两个玩家之间转身；只有高优先级 hazard、target invalid、task failure 或分数超过阈值才中断。

## Task 状态机

### 通用攻击任务

```txt
acquire-target
  -> request-route
  -> move-into-range
  -> reserve-attack-slot
  -> face/aim
  -> telegraph
  -> request-gas-ability
  -> committed/active
  -> recover
  -> release-slot
  -> succeeded
```

`request-gas-ability` 只提交 semantic action intent。Task 必须等待 authority GAS/Combat 返回
accepted、rejected 或 cancelled：accepted 后进入 recover；cooldown、target-lost、out-of-range 等
rejection 进入带原因的 backoff 或重新寻路；owner removal、death 和 session reset 强制取消并释放
route/slot。Task 不能直接调用 attribute mutation、damage helper、Physics teleport 或 Renderer/Audio API。

任何阶段都定义 timeout、cancel 与 failure：target invalid、no path、slot lost、line of sight lost、ability rejected、stagger、owner death。Failure 使用 backoff 后重评，不能同 tick 反复请求 ability。

### 移动任务

- Navigation 提供 route sample / preferred direction。
- Steering 加入 separation、wall anticipation、arrival 与攻击位 offset。
- Physics 执行 kinematic/dynamic movement，并返回实际 transform/velocity。
- Progress monitor 比较沿 route 的推进，不以“速度非零”判断是否卡住。
- Stuck 先尝试局部重选 corridor，再请求新 path，最后进入 recovery/despawn fail-safe。

## 攻击槽与群体压力

每个目标维护逻辑 attack slots：

- 普通玩家默认 2 个近战 slot、有限远程 firing lane。
- 核心和设施按 collider 周长/authoring socket 提供更多 slot。
- Brute 占用 elite slot，避免多个大体型完全重叠。
- 进入 telegraph 前必须成功 reserve；cancel/death/timeout 释放。

没有 slot 的 agent 选择 flank、等待位、其他目标或推进核心，不能挤在同一点持续推碰撞体。Slot 是 app-local combat pressure policy，不进入 AI Core。

## Navigation 方案

Frontier 07 使用 authored lane graph + goal-keyed reverse route field：

- 节点/edge 描述四条入口、外环、中央环、设施区、核心和撤离区。
- 大量敌人前往核心/设施时共享 route field，不为每个 agent 单独 A\*。
- 追逐移动玩家只在跨 region 或 route invalid 时请求新 path；局部位置由 steering 调整。
- Barricade/设施修改 edge cost 或 blocker revision；放置前验证至少一条入口到核心路径仍存在。
- Physics static layout、Render placement 和 Navigation blocker 都从 arena object instance 派生，但各 runtime 独立拥有状态。

Graph backend 先满足本关卡；Navigation Core 保持 backend-neutral，未来 grid/navmesh 不改变 AI task contract。

## 调度与 AI LOD

| 距离/威胁级别          | 感知频率 | Utility 重评 | Task/Movement                |
| ---------------------- | -------- | ------------ | ---------------------------- |
| 正在攻击/屏内高威胁    | 10 Hz    | 5–10 Hz      | 每 authority tick            |
| 中距离推进             | 5 Hz     | 2–5 Hz       | 每 tick route sample/Physics |
| 远距离/入口生成        | 2 Hz     | 1–2 Hz       | 低频 route sample，稳定移动  |
| Waiting/inactive spawn | 按事件   | 不重评       | 不移动                       |

频率是内容/性能 policy，不改变 committed ability timing。Agent bucket 由 stable id 分散，不能每秒整齐尖峰。

## 敌人角色

### Raider

目标：快速占据玩家近战压力，没人阻挡时推进核心。

- Goal 偏好：near player > core。
- Task：approach/flank → 0.45 秒 telegraph → melee sweep → recover。
- 低生命不会逃跑；受到 Shock 时降低推进速度。
- 无攻击槽时沿目标周围等待点分布，不堆叠。

### Gunner

目标：建立中距离视线，迫使玩家离开固定站位。

- 评分考虑 range band、line of sight、cover exposure 和 nearby gunner density。
- 移动到 firing position 后进行 0.7 秒预兆与三发 burst。
- 目标失去视线时 reposition，不对墙持续空射。
- 玩家过近时优先退到可达 firing point，而不是贴脸旋转。

### Saboteur

目标：攻击供能节点、炮塔和 Shock Pylon。

- 使用共享设施告警和 path cost 选择目标。
- 到达后 channel disable ability；受 heavy hit/stagger 或目标销毁时中断。
- 连续受到玩家伤害时短时转火自卫，但 commitment 结束后恢复破坏职责。
- 不选择已被足够 Saboteur 占用的同一设施。

### Brute

目标：打开路障并制造高预兆的核心压力。

- 偏好 Barricade、核心、聚集玩家，不追逐远离战场的单人。
- Charge 使用长走廊检查与 1 秒预兆；途中碰撞墙/路障按 Combat hit policy 结算。
- Heavy slam 使用大范围 shape delivery 和长 recovery。
- Stagger resistance 使用 GAS effect 递减，仍提供可见反馈。

## Overseer 首领 AI

Boss phase 由 Match/Encounter + TCA 决定，AI Core 只执行当前 phase 允许的 goals/tasks。

### Phase 1：封锁

- 在外环移动并选择有玩家覆盖的扇形扫射位。
- 召唤由 Director 控制，不由 agent task 自行 spawn。
- 保持距离，不直接冲向核心。

### Phase 2：断能

- 选择仍存活供能节点，执行 `link-node` task。
- Link 成功后获得减伤；玩家打断连接或破坏 channel anchor。
- 无可用节点时使用替代 shield pulse，不能卡在选目标状态。

### Phase 3：攻城

- 提高 `attack-core` utility，沿明确路线推进。
- 在 core slam、player knockback 和 summon window 间按 cooldown/utility 选择。
- Core slam 预兆至少 1.2 秒，失败/被 stagger 后有明确 recover。

Boss 不使用无反制全屏伤害或纯等待无敌阶段。Transition 会取消冲突 task、释放 slot/path、保留合法 cooldown 并启动下一 phase stable task。

## Authority、Save 与重连

AI 只运行在 authority。Checkpoint 保存 active goal、task phase、target stable id、commit/cooldown、必要 memory、route key/revision 和 scheduler cursor。Restore 后重新绑定 entity/actor/path handle，不保存 native graph node 或 query cache。

Client late join 从 replicated target、execution、phase 与 transform 构建表现；不会运行 shadow AI 猜测攻击。Disconnect 玩家进入 gameplay policy 定义的安全状态后，AI target policy 立即重新评估其可攻击性。

## Trace 与验证

选择 agent 的 DevTools 需要回答：

- 看到了什么、何时过期？
- 每个 goal 为什么得分？为什么切换/保持？
- 当前 task/phase/target/path/slot 是什么？
- Ability 为什么被接受或拒绝？
- 是否被 AI/navigation budget 延迟？
- 是否 stuck、重寻路或 fail-safe despawn？

自动化覆盖 deterministic goal selection、hysteresis、task interrupt、path failure、slot release、stuck recovery、每种敌人行为、boss phase restore、250/1,000 agent scheduler 和 dispose retained state。
