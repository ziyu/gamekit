# Knockout Arena 比赛流程与胜负

## 领域边界

Match Flow 是 Arena app-local authority domain。它拥有 match/stage phase、参与者资格、deadline、排名、晋级、淘汰、
winner、KO credit 和 rematch 清理；不拥有 Physics step、网络 transport、AI 决策、动画或 UI 本地页面状态。

客户端只消费公开 projection。React、Three 或本地 timer 不能自行推进 phase、判定淘汰或提交 winner。

## Authority 运行时所有权

赛事 authority 拆成三个 app-local owner：

- Participant Registry 拥有 `participantId`、slot/actor/peer 绑定、连接状态、participant status、revision 与有界 transition trace。
  Transport peer 连接或断开只能通过 registry 改变绑定，不能直接改 Physics member 或 winner。
- Match Director 拥有 match/round、stage 顺序、phase/stage instance、phase deadline、winner 引用与有界 phase trace。它只输出
  `stage-prepared`、`stage-started`、`stage-completed`、`rematch-reset` action，不直接操作 Physics、Registry 或网络。
- Stage Rule 是从 compiled stage definition 创建的无状态规则边界，消费 entrant/active participant id 与 authority elapsed tick，
  只返回 continue 或带稳定 reason 的 complete。排名、晋级和 tie-break 在专用 ranking policy 中实现，不能塞回 director。

Arena authority composition 按 `peer reconcile → elimination facts → director/rule → participant transitions → Physics commands → projection`
的固定顺序执行 action。进入 running 的同一 tick 不评估 stage completion，必须先完成 lobby→active 转换，避免空 active set 被误判为
全员淘汰。三个 owner 都声明容量、reset/dispose 与 diagnostics；trace 只保留有界语义转换，不记录每 tick 全量 roster。

Ranking Policy 是第四个纯规则边界。它一次消费当前 stage 的 authority fact snapshot，不持有 Physics、Registry 或 Director：

- qualifier key 为 eligible、finished、checkpoint、route progress、progress tick、participant id。
- brawl key 为 eligible、active、objective、KO、assist、instability、center distance、participant id。
- final key 为 eligible、active、elimination tick、instability、KO、center distance、participant id。

每次 settlement 生成稳定 `settlementId`、`placementId`、qualified/eliminated 集合和可解释 ranking key；deadline 结算显式记录
`timeout-tiebreak`。已经由 kill volume 淘汰的 participant 在排序前即失去 eligible，不会因旧 progress 重新晋级。Authority 只缓存每名
participant 一条有界空间摘要，淘汰/成员移除后仍可用最后一条 authority fact 结算。

Impact Ledger 与排名分离：它按 hit ticket 去重并保留有界 authority-confirmed impact，按 elimination id 原子生成一次 KO/assist
attribution。KO 使用 knockout window 内最后一个超过 threshold 的敌对 source；assist 从 assist window 中按最近、impulse、source id
稳定选择不同 source。没有有效 source 时必须记录 environment，不能为了积分伪造攻击者。Combat 尚未提交 impact 的阶段，ledger 仍正常
产出 environment attribution；后续 Combat 集成只写 ledger，不改 ranking comparator。

## 身份与实例

比赛相关 identity 必须区分：

- `sessionId`：Multiplayer room 生命周期。
- `matchId`：一次完整三 stage 比赛；rematch 创建新 id 与 seed。
- `stageId` / `stageInstanceId`：内容定义 id 与本次运行实例。
- `participantId`：本场参赛身份，关联 peer/player/bot，但不等于 transport peer id。
- `actorMemberId`：当前 Physics island 中的角色成员 id。
- `placementId` / `resultId`：稳定结算事实 identity，用于去重和重连恢复。

旧 match 的 command、input epoch、prediction history、effect watermark 或 result 不能跨 `matchId` 复用。

每个 `stage-prepared` action 创建新的 Physics generation。Generation 同时编码 match、stage 和安装时的 membership revision；
客户端以 frame generation 作为 playback、prediction island 与 effect journal 的共同 reset identity，不能只比较 round 或本地 tick。

## 参与者状态

```ts
type ArenaParticipantStatus =
  | "lobby"
  | "active"
  | "qualified"
  | "eliminated"
  | "spectator"
  | "next-match"
  | "disconnected"
  | "finished";
```

状态转换由 authority 明确记录 reason、effective tick 与 stage instance：

- `lobby → active`：内容与客户端 compatibility 通过，match 开始。
- `active → qualified`：满足本 stage 晋级条件。
- `active → eliminated`：离开有效场地、未进入晋级名额、forfeit 或规则淘汰。
- `qualified → active`：下一 stage 新 generation 安装完成。
- `eliminated/finished → spectator`：保留房间连接并可选择观战目标。
- `spectator/next-match → lobby`：下一场 match 按可用真人席位重新组建阵容；无可用席位时继续排队/观战。
- 任意在线状态 → `disconnected`：席位进入有界 reconnect grace；超时后按 stage policy 处理。

同一个 stage 内 `eliminated` 不能回到 `active`。网络重连只恢复已经存在的 authority participant 状态，不复活角色。

## 完整状态机

```txt
title
  -> lobby
  -> loading
  -> match-countdown
  -> stage-1-intro
  -> stage-1-running
  -> stage-1-results
  -> intermission
  -> stage-2-intro
  -> stage-2-running
  -> stage-2-sudden-death
  -> stage-2-results
  -> intermission
  -> stage-3-intro
  -> stage-3-running
  -> stage-3-sudden-death
  -> match-results
  -> rematch-vote
  -> lobby / leave
```

每个 phase 公开 `phaseInstanceId`、`startedAtTick`、`deadlineTick` 和 transition reason。Deadline 使用 authority fixed clock；
客户端显示可以插值，但不得用本地时间结算。

## Lobby、Loading 与开始

- 标准阵容为 8 名 participant。真人占用有效 player slot，剩余位置由 bots 在 match 开始时一次性补齐。
- 已进入 running stage 后的新连接成为 spectator/next-match，不替换当前 bot 或已淘汰参与者。
- Lobby 保存 display name、ready、输入能力摘要与 compatibility；角色数值和 bot 难度来自 match profile。
- Loading 必须区分 required content 未就绪、版本不兼容、authority 创建失败、网络中断和等待其他成员。
- 开始倒计时期间 participant 或 required content 变化会重建 readiness；不能把未加载客户端带入 stage。

## Stage 1：Circuit Forge 资格赛

Authority 排名键依次为：

1. 已完成者优先。
2. 完成 checkpoint 数量。
3. 沿当前 route 的 authority progress。
4. 完成/到达该进度的 authority tick。
5. `participantId` 稳定 tie-break。

前 6 名进入 `qualified`。掉出 kill volume 的参与者立即 `eliminated`，当前 stage 不重生。Stage 在 6 名完成、有效参与者
不足以改变晋级集合或 deadline 到达后结算；不能等待已经 disconnect/卡死的角色无限延长。

## Stage 2：Scrap Yard 道具乱斗

6 名参与者进入，前 3 名晋级。公开排名由以下事实组成：

1. 仍存活者优先。
2. Objective score。
3. Confirmed knockout credit。
4. Confirmed assist credit。
5. Instability 较低者。
6. 离安全中心更近者。
7. `participantId` 稳定 tie-break。

场地 hazard schedule 必须在 deadline 前强制收敛到最多 3 名有效参与者。若 deadline 到达仍超过 3 人，使用上述排名键
选择晋级者；客户端本地 contact、cue 或预测位置不能参与结算。

## Stage 3：Crown Collapse 决赛

3 名参与者进入，最后一名存活者获胜。安全区域与落脚面按 versioned authority schedule 收缩，保证比赛有限结束。

若出现同时淘汰，排名依次使用：

1. 淘汰生效 tick 更晚。
2. 淘汰前最后一个有效 Physics checkpoint 中 instability 更低。
3. Confirmed knockout/objective score 更高。
4. 淘汰前离安全中心更近。
5. `participantId`。

Deadline 只是故障保护，按“存活 → knockout → instability → 中心控制 → id”选择唯一 winner，并记录
`timeout-tiebreak` reason。

## 淘汰与 Physics 成员

- Authority 在 stage running tick 读取有效 bounds/kill volume，产生一次 `eliminationId`。
- 同一 tick 的 match result 先标记 participant，再向 Physics island 排入 actor despawn，随后生成新的成员 projection。
- Membership revision 只在成员集合真实变化时递增；同一 elimination 重复检测必须幂等。
- 淘汰 actor 不被传送回 spawn、不保留 collider、不接收 motor command，也不出现在 active ranking 中。
- 下一 stage 使用新 generation，仅以 qualified participant 与该 stage 内容创建 baseline。

## KO 与助攻归因

KO attribution 只消费 authority-confirmed impact ledger。每条 ledger entry 包含 source、target、item/ability、impulse、tick、
hit ticket 和 cause。

- 目标淘汰时，在有界 attribution window 内选择最后一个超过有效 impulse threshold 的敌对 source 作为 KO。
- 更早但仍在 assist window 且贡献超过阈值的不同 source 获得 assist。
- Hazard、self-impact、无有效 source 或窗口过期记录为 environment KO，不伪造 player credit。
- 同一 elimination id 最多产生一个 KO 与有限 assist；replay、duplicate snapshot 或重连不能重复累计。

具体 impulse/instability 数值归 [`items-and-physical-combat.md`](./items-and-physical-combat.md) 维护。

## Disconnect、重连与 Late Join

- Disconnect 不立即改写 winner；当前 actor 按 stage profile 进入 neutral/authority-bot takeover 或 forfeit grace。
- Grace 内重连恢复原 `participantId`、资格、item owner 和 public action phase，但使用新 binding/input epoch。
- Grace 超时后，资格赛按 forfeit 结束当前 progress；乱斗/决赛触发 authority elimination。
- Late join 只加入 spectator roster，下一 match 才能 active。它没有当前 stage 投票、排名或 item command 权限。
- Spectator snapshot 只包含公开 gameplay state；不能泄漏 AI blackboard、隐藏 item respawn 或未公开 hazard 随机结果。

## Results 与 Rematch

Stage Results 展示晋级者、淘汰 reason、关键 KO 和下一 stage 预告。Match Results 是 authority stable summary：

- winner 与完整 placement。
- 每 stage finish/progress/objective/KO/assist。
- 使用过的道具、最大 impact、被机关淘汰原因。
- 网络断线/forfeit 等不会冒充玩法 KO 的状态。

Rematch 创建新 `matchId`、seed、stage instances、input epoch 和 Physics generations，并清理旧 World member、item、Combat
ticket、GAS execution/effect、AI memory/path、prediction history、effect journal、Animator binding、Audio instance 和
results vote。显示名与用户输入/辅助设置可以保留，比赛内 score、instability、item 与 qualification 不能带入。

Authority 必须提供可在 dispose 后读取的 retained-state 诊断；participant、Physics member/history/command、impact、input/ack、
actor control、effect、ranking fact、stage entrant/result 与最后 snapshot 均应归零。不能用“对象已不可调用”代替资源释放证据。

## Authority Projection 与诊断

Match projection 公开：

- `matchId`、`phaseInstanceId`、`stageIndex/stageCount`、`stageId/kind/instanceId`、authority start/deadline tick 与
  `membershipRevision`。
- 有界 participant roster，包括 kind、slot、actor/peer binding、connected、status/resume status、stage instance 与 revision。
- 每个已结算 stage 的稳定 placement、qualified/eliminated 集合、ranking key、timeout reason 与 final winner。
- 当前 Physics frame、peer input ack、实际 actor control、离岛 actor、authority effect 与容量诊断。

协议 reader 必须同时验证 schema/definition、有限数字、唯一 id、participant/result 容量，以及
`match.membershipRevision === frame.membershipRevision`。Projection 不复制内部候选排序缓存、AI 决策、Physics contact 列表或
每 tick 全量 ledger。

诊断至少回答：

- 为什么进入/离开某 phase。
- 为什么某 participant 晋级、淘汰或获得某 placement。
- 平局使用了哪一级 tie-break。
- KO/assist 关联了哪个 hit ticket/impact ledger。
- Disconnect/late join 使用了哪条 participant policy。
- Stage reset 后旧 generation 是否完全释放。
