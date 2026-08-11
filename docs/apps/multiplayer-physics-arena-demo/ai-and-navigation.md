# Knockout Arena AI 与 Navigation

## 领域边界

Bots 只在 authority 运行。AI Core 负责 perception、memory、utility selection、task lifecycle、scheduler 和 trace；
Navigation 负责 path/route 与 revision；Arena 注册具体 sensor、goal、task executor、steering policy 和 skill profile；Character
Controller、Interaction、Combat 与 Match 继续通过与玩家相同的 authority validation 执行结果。

AI 不直接设置 body transform/velocity、扣 instability、分配 item owner、提交 KO 或决定 winner。

## 公平性原则

- Bot 只读取 authority 可用的 World/Physics/gameplay read model，不读取其他客户端 input、隐藏 UI 或未来随机结果。
- Physics sensor 使用同样的 collision/query filter；视线、距离、item availability 和 hazard phase 都有感知延迟与 memory。
- Bot 输出与玩家同构的 move/aim/jump/dive/interact/use/throw intent，经过相同 cooldown、reach、pickup claim 和 Combat policy。
- 难度通过 reaction time、aim error、utility weight、risk、commitment 和 memory 精度调整，不通过超速、穿墙或免疫机关。
- Match profile 可以显式声明 handicap，但必须公开并进入 results/diagnostics。

## Agent Binding 与 Profile

每个 bot 显式关联：

- `participantId`、`actorMemberId`、AI `agentId` 与 Data `definitionId`。
- stage/match instance 与 scheduler class。
- skill profile：reaction interval、perception latency、aim error、risk、aggression、item preference、recovery delay。
- archetype：`sprinter`、`brawler` 或 `opportunist`。

Participant 淘汰、stage generation change、match reset 或 authority dispose 时，AI binding、memory、task、path/route 和 pending
interaction 必须同步清理。

Skill profile 与 archetype 是两类 Data：`arena.bot-profile` 只定义 reaction/perception/decision interval、memory TTL/limit、
perception radius/candidate limit、hazard lookahead、aim error、aggression、risk、commitment 与 recovery；
`arena.bot-archetype` 通过 DataRef 组合 skill profile、character motor、preferred item 和 goal weight。Sprinter、Brawler、
Opportunist 共享同一 runtime/sensor/task 实现，不能在 authority update 中各写一套分支。

## Perception

### Opponent Sensor

输出有界候选：position、relative velocity、distance、line of sight、instability、motor mode、carried item、距边缘/危险区、
最近攻击者和 confidence。候选先通过共享 spatial cache，再按 agent 视线/query 过滤；不能每个 bot 每 tick 全量扫描 World。

### Item Sensor

输出 world item 的 instance/generation、category、价值、距离、可达性、是否正在被争抢、spawn/hazard risk。Carried/hidden item
不作为 world pickup 候选；旧 generation observation 在 owner/state 变化后失效。

### Hazard Sensor

读取公开/current authority hazard phase、danger volume、platform/sweeper/piston timing、safe region 与附近落脚面。AI 可以根据
已公开 schedule 预测短时窗口，但不能读取未来随机分支；随机 pattern 只有 commit 后才进入 shared fact。

### Objective Sensor

资格赛读取 checkpoint/finish/progress/剩余晋级名额；乱斗读取中心区、score、剩余 participant；决赛读取 safe zone、
collapse state 和 winner convergence。

### Impact Sensor

读取最近受击 source/direction/severity、stagger/recovery 与有界 threat memory。它不读取完整 authority impact ledger 或其他
participant 的隐藏归因窗口。

五类 Arena sampler 使用 AI Core `AiSensorSampler`/`AiPerceptionFact`：`arena.opponent`、`arena.item`、`arena.hazard`、
`arena.objective`、`arena.impact`。Source contract 只接受当前 authority tick 的 actor/item/hazard/objective/impact read model；opponent
候选按距离与 participant id 稳定排序并经过 Physics raycast，item/hazard 候选按 profile 硬上限截断。Fact TTL 来自 skill profile，
实际 retain/prune/checkpoint/dispose 继续由 AI Core bounded memory 负责。

## Memory 与 Shared Facts

- Agent memory 保存最后观察位置、item 状态、hazard phase、threat 与 task 需要的少量 stable value，并具有 TTL/容量上限。
- Shared fact cache 保存 stage objective、公开 hazard、可见候选索引和 route goal；每个 agent 的 target/commitment 不共享。
- Blackboard 不保存 Physics/Navigation handle、World entity object、Three object、GAS runtime 或 native route。
- Restore 后无法重绑的 target/item/route 清除并触发受控重新决策，不无限重试旧 id。

## Utility Goal

| Goal                | 主要 input                              | 进入条件                   | 退出/切换约束                         |
| ------------------- | --------------------------------------- | -------------------------- | ------------------------------------- |
| `survive`           | edge risk、hazard、instability、stagger | 风险超过 profile threshold | 安全持续一段时间；高优先级可中断      |
| `advance`           | route progress、晋级名额、deadline      | 资格赛 active 且存在 route | finish/eliminated/path failed         |
| `acquire-item`      | item value、distance、competition       | carry empty 且 item 可达   | claim result/target stale/风险升高    |
| `deny-item`         | 敌人脆弱度、高价值 item                 | opportunist/brawler policy | item owner change 或 commit timeout   |
| `attack-vulnerable` | target edge/instability/recovery        | 持有有效 item/action ready | target lost、unsafe、execution result |
| `contest-objective` | score、center occupancy、晋级线         | 乱斗需要积分/卡位          | score 安全或风险过高                  |
| `recover-position`  | stuck、off-route、被击飞                | progress tracker 失败      | 回到有效 route/safe area 或 timeout   |

Goal 使用 deterministic tie-break、hysteresis、minimum commitment、switch threshold 和 cooldown。Trace 记录所有 candidate score
summary 与最终 switch reason，不能只记录 winner。

## Task State Machine

通用 task 阶段：

```txt
acquire target
  -> request/validate route
  -> move/steer
  -> align/telegraph/windup
  -> commit intent
  -> await authority result
  -> recover / succeed / fail
```

Task executor 只能输出 intent、Navigation request/cancel 或写入自身有界 task state。失败 reason 至少区分 target-lost、
item-stale、claim-rejected、path-failed/stale、stuck、action-rejected、unsafe、timeout、interrupted 和 owner-removed。

Committed use/throw 受 `safe-point` interrupt policy 约束；AI 不能因为 utility 分数瞬间变化而每 tick取消/重启 windup。

Authority 组合只创建一个 AI Core runtime，并由 Arena DataPack 注册六类 goal 与共享 task executor。Utility 输出的
`movement`/`jump` intent 统一归一化为 `ArenaMoveInput`，继续经过与玩家相同的 `CharacterControlIntent` 和 Motor；`pickup`/`use`
intent 则转换为稳定 command id 的 `ArenaItemAction`，继续经过同一 target generation、claim、owner、windup 与 Combat 校验。
Authority 不再保留脚本巡航或 Bot 专用速度写入路径；未连接的人类 slot 使用 neutral input，也不会隐式变成 Bot。

Perception source 每个 authority tick 捕获一次有界 read model，并按 actor 缓存个性化 objective frame；同一 tick 的五类 sensor
与 task 读取同一份事实。Stage instance 改变时先 unbind 旧 agent，再按新 entrant/archetype 绑定，清空 memory、task 和 pending
intent；actor 因淘汰先于 task update 脱离物理岛时，task 以 `actor-unavailable` 安全失败，不能抛错或重生实体。

## Navigation

- Circuit Forge 使用 Recast/static navmesh 或明确 portal，按 character profile radius/height/slope/area 求 route。
- Scrap Yard 与 Crown Collapse 使用较短 route/safe-region goal；动态墙/tile 通过 obstacle/revision 使旧 route stale。
- Navigation sample 只提供 preferred direction/next point/remaining distance；最终 steering、jump/dive 和 collision 由 Arena policy
  与 Character Controller 执行。
- Portal 表达 jump/launch/moving-platform entry/exit；Task 到达 entry 后提交语义 traversal intent，Navigation 不 teleport body。
- Route 完成、目标变化、agent 淘汰或 stage reset 时显式 release；不能累积 route/field。

生产 Room 在已有 async runtime factory 内初始化 Recast WASM，并为三关一次性烘焙 artifact；同步 authority 只接收准备完成的
Arena navigation runtime，不在 tick 内初始化或烘焙。每关持有独立标准 `NavigationRuntime`/Recast backend，共用
`arena.bot.navigation` profile，提交和 poll 预算分别限制为每 tick 2/8，request、result、route、field、cache 和 trace 均有硬上限。
Stage 切换先释放 wrapper 记录的 request/route，再切 active runtime；authority dispose 后 retained request/route 必须为 0。

AI task 通过 AI Core 的 per-agent `NavigationQueries` 请求 route：checkpoint、finish、objective 和 safe region 使用共享 goal field，
移动 item/opponent 使用 point path。Task state 只保存 request/route id、revision、remaining/cross-track distance、retry deadline 和
stuck 摘要；cancel、target change、stale/missing route、agent removal 都显式 cancel/release。Navigation owner 仍是标准 runtime，
Arena 不缓存 native polygon、field handle 或 Recast object。

## Local Steering 与 Hazard Timing

Arena steering 组合：

```txt
Navigation preferred direction
  + route cross-track correction
  + short-horizon separation
  + predicted hazard exclusion/attraction
  + item/target alignment
  + controller locomotion constraints
  -> CharacterControlIntent
```

- Separation 只使用有界附近 actor/prop 候选，不实现第二套 Physics collision。
- Hazard timing 可以选择等待、绕行、jump/dive 或 commit 快速通过，但输出仍是 intent。
- Steering 不直接覆盖已提交 knockback/stagger；Character Controller 决定本 tick 可接受的控制量。
- Stuck tracker 观察 authority position/progress；恢复顺序是重新投影 → 重寻路 → 短期 backoff → 有记录的 task fail，不能
  静默 teleport。

当前 steering 每 tick 组合 route preferred direction、有界 2.4 m actor separation 与 warning/active hazard avoidance，并把结果归一化
为移动 intent；近距离 active hazard 只发出 jump intent，不改 body。进度锚点移动 0.55 m 才刷新；1.25 秒无进度触发由 agent id
稳定散列的 backoff，最多两次，随后以 `stuck` 失败并进入 AI Core failure backoff。该状态完全属于 task，stage 解绑即清除。

## Archetype

### Sprinter

高 `advance`、低无意义战斗，偏好安全捷径与轻型道具；在晋级线安全后才 deny/attack。反应较快但瞄准与风险判断一般。

### Brawler

高 `attack-vulnerable` 与重型/近战道具偏好，善于把目标逼向边缘；仍必须服从 survive 和 objective，不能无限追离路线。

### Opportunist

高 item/value/deny 权重，优先抢夺无人看守道具、攻击 recovery 目标和控制中心区；commitment 较短但有 hysteresis 防抖。

Archetype 只调整 definition/utility/task args，不复制专属 update loop。

## Stage Tactics

- 资格赛：route progress、机关窗口、拥堵绕行、捷径风险和最后晋级名额。
- 道具乱斗：安全区、item economy、目标脆弱度、中心控制、携带/蓄力时机和边缘攻击。
- 坍塌决赛：safe tile 预测、空间保持、有限 item deny 和 sudden-death 中心优先。
- Stage transition 强制结束旧 task/path/item target；新 stage 从 intro 事实建立新的 shared cache。

## Scheduler 与性能

- Character intent/Physics integration 保持 60 Hz；perception、utility、path request 按 stable bucket 错峰。
- Near-threat/active-combat bot 使用高 scheduler class，远离交互者降频；切换不重置已到期工作。
- Perception、decision、path request、trace production 各有独立预算；超限延迟低优先级工作并产生 summary diagnostic。
- 已 committed action、stage result 和 Physics step 不能因 AI budget 超限跳过。
- 共享候选/route field、编译 definition 和复用临时 buffer，热路径不解释 Data、不创建大型对象树。

具体整体性能预算见 [`quality-and-acceptance.md`](./quality-and-acceptance.md)。

## Multiplayer 与 Presentation

- AI runtime、memory、utility score 和 route 只在 authority，不复制到客户端。
- 客户端复制 bot 实际消费的 continuous control、公开 target/telegraph/action phase、carried item 和 motor semantic state。
- Remote bot 与玩家一样进入 client prediction replay；不能只插值一个仍会和本地玩家碰撞的 bot。
- Animator/Audio/UI 从公开 task/action semantic state表现，不读取 AI trace 决定 gameplay。

## 诊断与契约

DevTools 选中 bot 时可查看 perception summary、memory count、goal scores、active goal/commitment、task phase、target、route、
last intent、stuck state、scheduler class、budget delay 和 fail reason。正式客户端不接收完整明细。

契约覆盖 deterministic selection/tie-break、goal hysteresis、safe-point interrupt、item stale/claim reject、path stale、hazard
avoidance、stuck recovery、stage reset、agent removal、checkpoint/restore、trace budget 和 8/12 bot authority profile。
