# Knockout Arena 完整物理竞技游戏

Status: Active.

## 工作流目标

把已经验证多人 Physics prediction/rollback 的 `multiplayer-physics-arena-demo` 推进为一个可以完整游玩和验收的物理
竞技游戏：一场比赛包含多 stage 晋级、明确胜负、可靠的角色控制、可拾取/使用/投掷道具、多种场景机关、具备策略的
authority AI，以及完整表现、诊断和网络故障验收。

长期设计入口：

- `docs/apps/multiplayer-physics-arena-demo/README.md`
- `docs/modules/physics.md`
- `docs/modules/multiplayer.md`
- `docs/modules/combat.md`
- `docs/modules/ai.md`
- `docs/modules/navigation.md`
- `docs/adr/0049-standard-multiplayer-physics-arena-prediction.md`

已关闭的 prediction 基础工作流见 `multiplayer-physics-arena-prediction.md`。本文只记录新的完整游戏实施，不重新实现已
关闭的 snapshot、ack、history、reconcile、hard correction 或 effect journal。

## 完成定义

长期功能、测试、网络和性能验收标准由
[`quality-and-acceptance.md`](../apps/multiplayer-physics-arena-demo/quality-and-acceptance.md) 唯一维护。本文只在各 P 任务下记录
当前实现证据、review、命令结果与 commit，不复制长期完成定义。

## 当前能力审计

| 领域         | 已有能力                                                                      | 主要缺口                                                                    | 归属                                                         |
| ------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Multiplayer  | Room authority、冗余输入、完整 arena frame、prediction domain、effect journal | 多 stage 参与者状态、道具离散 command/fact、附加模拟状态同 tick replay      | 规则在 app；标准 replay 扩展在 App Host/Multiplayer 组合     |
| Physics      | Rapier3D、query/contact、full-scene checkpoint、island spawn/patch/despawn    | 一等公民 impulse/body command、角色 motor、held item 的安全物理生命周期     | Physics command 进 Core/adapter；motor 进可选 toolkit        |
| Character    | 共享无状态速度 patch、dynamic capsule、jump                                   | grounded/slope/step/coyote/buffer/platform/dive/stagger/carry 与 checkpoint | 新可复用 character-controller toolkit                        |
| Combat/GAS   | melee/area/projectile、hit dedupe、effect、execution phase、trace             | 物理冲击到 instability/stagger/knockback 的 Arena policy                    | Core 继续复用；数值与结果 policy 留 app                      |
| Item         | dynamic prop、predicted spawn/despawn primitives                              | pickup arbitration、carry/use/throw state、respawn、presentation attachment | Arena app-local runtime + DataType                           |
| AI           | perception、utility、task、intent、scheduler、trace                           | Arena sensor/goal/task、Recast course、hazard timing、item tactics          | AI/Nav Core + Arena definitions/executors                    |
| Match        | countdown/running/results/rematch、淘汰 despawn                               | 多 stage 晋级、观战、timeout tie-break、KO credit、late join                | Arena authority/TCA app-local                                |
| Content      | versioned static layout、少量 kinematic/dynamic body                          | stage/course/hazard/item spawn 数据与 validator                             | Arena DataPack/DataType；backend geometry 留 adapter/tooling |
| Presentation | Three scene、第三人称镜头、HUD、基础 FX                                       | controller state、carry/action/reaction 动画、空间音频、spectator/results   | Animator/Audio/Camera + app presentation mapping             |

## 架构与状态所有权

长期系统分层与全局不变量见
[`README.md`](../apps/multiplayer-physics-arena-demo/README.md)，具体多人状态所有权见
[`multiplayer-and-prediction.md`](../apps/multiplayer-physics-arena-demo/multiplayer-and-prediction.md)。本工作流只记录实现这些
边界时的任务与验证，不建立第二套架构描述。

## 必须先关闭的公共协议缺口

### Physics body command / impulse

新增 ADR 后，为 Physics facade 提供 backend-neutral、可排序、可 checkpoint/replay 的一次性 body command，至少覆盖：

- linear impulse 与可选 world-space application point；
- angular impulse；
- wake/sleep policy；
- kinematic target 或明确说明继续使用 patch；
- stable tick/sequence/correlation 与 command rejection diagnostics。

Rapier2D/3D 与 memory backend 必须通过同一 conformance。Prediction island 需要能按稳定顺序 replay impulse，不能由 Arena
通过读取 native mass/handle 自己计算或直接调用 Rapier。

### 可复用角色控制器

优先新增独立的可选 `@gamekit/character-controller` toolkit，而不是继续膨胀 Physics Core。它只依赖 GameKit 的
Physics query/body command、World/GameRuntime/Data 协议，不依赖 DOM/Input adapter、Renderer、Three 或 Rapier。

公共 contract 至少包含：

- `CharacterControlIntent`：move、facing/aim、jump、dive 等只影响角色 motor 的物理无关输入；拾取/use/throw 由 app 的
  `ArenaActionIntent` 组合，不能反向膨胀 controller toolkit；
- `CharacterMotorDefinition`：速度、加速度、制动、空中控制、ground probe、坡度、台阶、coyote、buffer、jump/dive；
- `CharacterMotorState`：grounded、ground normal/body、platform velocity、locomotion mode、timers 和 facing；
- pure tick / runtime、checkpoint/reset、trace、diagnostics、memory fixture 和 Rapier3D conformance；
- player 与 AI 共享的 intent sink，不给 AI 特权。

Arena 是第一个真实消费者；Physics 3D Lab 提供第二 fixture。若不同 backend 无法共享同一动态 motor 语义，协议允许窄
backend strategy adapter，但 native controller 类型不能进入公共状态。

### Arena auxiliary replay state

增强标准 Physics Arena adapter，使 Physics island 与 character motor 等少量确定性 contributor 在同一 authority tick
capture/restore/replay/reset。实现必须：

- 保持 Physics solver 只有一个 rollback owner；
- contributor 明确 max bytes/history/replay work；
- generation、membership revision、history overflow 与 dispose 同步处理；
- 不把整个 World、AI、match state 或 presentation state默认回滚；
- 保持只使用无状态 `mapInput` 的现有 consumer 完全兼容。

该变化需要 ADR 和 App Host/Multiplayer/Physics 回归矩阵，不能在 Arena session callback 中私自调用多个 restore loop。

## 长期功能设计入口

- 比赛与胜负：[`match-flow.md`](../apps/multiplayer-physics-arena-demo/match-flow.md)
- 角色控制：[`character-controller.md`](../apps/multiplayer-physics-arena-demo/character-controller.md)
- 道具与战斗：[`items-and-physical-combat.md`](../apps/multiplayer-physics-arena-demo/items-and-physical-combat.md)
- 场景机关：[`stages-and-hazards.md`](../apps/multiplayer-physics-arena-demo/stages-and-hazards.md)
- AI 与路线：[`ai-and-navigation.md`](../apps/multiplayer-physics-arena-demo/ai-and-navigation.md)
- 表现与 UX：[`presentation-and-ux.md`](../apps/multiplayer-physics-arena-demo/presentation-and-ux.md)
- 内容与 Data：[`content-and-data.md`](../apps/multiplayer-physics-arena-demo/content-and-data.md)

## 实施阶段

| 阶段                             | 状态     | 主要产物                                                                          | 独立验收门                                         |
| -------------------------------- | -------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| P0：决策与基准                   | Accepted | Physics command、character controller、auxiliary replay ADR；数据/预算基线        | 公共边界 review；现有 consumer 兼容                |
| P1：Physics command 与角色控制器 | Accepted | Core/adapter command、character toolkit、semantic player/AI shared intent         | Rapier3D controller course；prediction replay 一致 |
| P2：赛事 authority               | Accepted | 多 stage 状态机、participant/qualification/spectator、winner/tie-break、TCA facts | headless 8 人完整 match/rematch                    |
| P3：道具与物理战斗               | Accepted | Item runtime/DataType、pickup/carry/use/throw、Combat/GAS、KO credit              | 2 client 争抢同一道具；无重复消费/命中             |
| P4：场景与内容                   | Accepted | 3 stage、机关/表面、shared layout、Recast source/validator                        | 每场可完成；无不可达 spawn/goal                    |
| P5：AI                           | Active   | Arena sensors/goals/tasks/archetypes、Navigation/steering、AI trace               | bots 能晋级、拾取、攻击、避险且不作弊              |
| P6：表现与 UX                    | Planned  | Animator、Audio、camera、HUD、spectator、results、可读 telegraph                  | 双窗口完整比赛体验，无 debug-only UI               |
| P7：网络与性能加固               | Planned  | item/pickup fault matrix、arena gameplay benchmark、soak、budget diagnostics      | 150 ms/5% loss 下整场收敛                          |
| P8：最终验收与关闭               | Planned  | review、全仓门禁、浏览器验收、文档收口、提交记录                                  | 完成定义全部满足                                   |

## 执行协议

- 工作包状态只使用 `Planned`、`Active`、`Accepted`、`Blocked`；同一时间只能有一个 `Active` 工作包。
- 只有依赖项全部 `Accepted` 后才能启动下一工作包。发现缺口时回到当前工作包 rework，不能用后续阶段替身绕过。
- 每个工作包必须同时交付实现、最小自动化验收、必要文档和一次独立提交；只写代码或只跑人工 smoke 都不能标记
  `Accepted`。
- 公共 API 工作包必须在编辑前记录 GitNexus upstream impact；高风险先报告，且必须包含 ADR、conformance 和至少两个真实
  consumer/fixture。
- App-local 工作包必须声明 authority/prediction/presentation 所有权，并验证 reset、generation、dispose、容量和 trace。
- 阶段关闭时运行该阶段专属命令和根级 `test/build/lint/format`；最终全量 benchmark 与浏览器验收留到 P8 再统一复跑。
- 验收证据写入本文“验收记录”，包含命令、结果、review 结论和 commit；长期设计事实仍只维护在 `docs/apps/`、
  `docs/modules/` 与 ADR。

## 工作包台账

| 工作包 | 状态     | 依赖         | 交付边界                                                        | 独立验收门                                                      |
| ------ | -------- | ------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| P0-01  | Accepted | —            | 三个公共缺口的影响分析、ADR 与 API/所有权草图                   | Physics、Multiplayer/App Host、第二 fixture 边界 review         |
| P0-02  | Accepted | P0-01        | 14-member 当前基线与 36-member 目标 profile 测量工具            | authority、payload、checkpoint/history、replay 指标可重复输出   |
| P0-03  | Accepted | P0-01        | Arena DataType、稳定 identity/generation 与内容校验骨架         | 无效引用/重复 id/非法 generation 的确定性 fixture               |
| P0-04  | Accepted | P0-02、P0-03 | P0 兼容 review、文档证据和阶段关闭                              | 现有 Multiplayer Demo、Outpost、Arena tests 与根级门禁通过      |
| P1-01  | Accepted | P0-04        | Physics body command 协议、排序/拒绝诊断与 memory backend       | command conformance 覆盖 impulse、point、wake、duplicate/replay |
| P1-02  | Accepted | P1-01        | Rapier2D/3D body command 映射                                   | 两个 adapter 通过同一 conformance；native capability 有诊断     |
| P1-03  | Accepted | P1-02        | `@gamekit/character-controller` pure motor、Data 与 diagnostics | ground/coyote/buffer/slope/step/platform/dive/stagger 单元契约  |
| P1-04  | Accepted | P1-03        | 标准 Arena auxiliary replay contributor                         | Physics 与 motor 同 tick capture/restore/replay/reset/dispose   |
| P1-05  | Accepted | P1-04        | Arena 与 Physics 3D Lab 接入共享 controller                     | 玩家/AI 同 intent；旧无状态 consumer 兼容                       |
| P1-06  | Accepted | P1-05        | Controller course 与高延迟 replay 验收                          | 平地、坡、台阶、平台、边缘、推挤、落地和 reconcile 全通过       |
| P2-01  | Accepted | P1-06        | Participant registry、match director 与 stage rule              | 所有参与者状态转换合法且可 trace                                |
| P2-02  | Accepted | P2-01        | 排名、晋级、KO/assist、timeout 与稳定 tie-break                 | deterministic headless ranking fixtures                         |
| P2-03  | Accepted | P2-02        | stage generation、membership revision 与公开结果投影            | 淘汰不复活；晋级/观战/late join/reconnect baseline 正确         |
| P2-04  | Accepted | P2-03        | 8 人三阶段 match/rematch headless 验收                          | 唯一 winner、完整清理、无 retained participant/island state     |
| P3-01  | Accepted | P2-04        | Item DataType、definition compiler 与 authority state machine   | world/claimed/carried/active/spent/respawn 转换与容量契约       |
| P3-02  | Accepted | P3-01        | stable target、pickup arbitration、carry、drop/throw Physics    | 两客户端同 tick 争抢只产生一个 owner；generation 稳定           |
| P3-03  | Accepted | P3-02        | Combat/GAS delivery、instability、stagger、knockback、KO bridge | 命中去重、冲击归因与 authority 淘汰 fixture                     |
| P3-04  | Accepted | P3-03        | 道具预测、effect journal 与 fault matrix                        | loss/duplicate/gap 下无重复消费、命中、cue 或幽灵 body          |
| P4-01  | Accepted | P3-04        | Course 编译器、共享 Physics/Nav/Presentation projection         | 相同 definition version 生成一致 stable ids 与空间事实          |
| P4-02  | Accepted | P4-01        | Circuit Forge 资格赛与 controller course                        | 8 人均存在可完成路线，机关时序确定且无隐形 blocker              |
| P4-03  | Accepted | P4-02        | Scrap Yard 与 Crown Collapse、道具/机关/强制收敛                | 两个 stage 可完成并在超时前产生稳定排名/唯一 winner             |
| P4-04  | Accepted | P4-03        | 内容 validator、Navigation source 与全 stage 验收               | spawn/route/clearance/kill volume/item/hazard/convergence 校验  |
| P5-01  | Active   | P4-04        | Arena perception、memory、profile 与 archetype Data             | Bot 只消费 authority 可见事实；reaction/aim/risk 可配置         |
| P5-02  | Planned  | P5-01        | Utility goal、interruptible task 与共享 character intent        | advance/survive/item/attack/escape fixtures 可确定重放          |
| P5-03  | Planned  | P5-02        | Recast route、local steering、hazard timing 与错峰 scheduler    | path stale/stuck/stage change 可恢复；无同帧全量重评尖峰        |
| P5-04  | Planned  | P5-03        | 三 archetype 完整比赛与 AI diagnostics 验收                     | Bots 能晋级、拾取、攻击、避险且不读客户端/未来状态              |
| P6-01  | Planned  | P5-04        | Presented state 与 Animator graph                               | rollback 不重复 action/reaction；remote/late join 恢复正确      |
| P6-02  | Planned  | P6-01        | Audio、VFX、telegraph 与 playing/spectator camera               | 并发有界、镜头不写回 simulation、关键信息可读                   |
| P6-03  | Planned  | P6-02        | Lobby/HUD/KO feed/spectator/results/rematch UX                  | 无 debug-only 主流程；gamepad/键鼠提示与 input scope 正确       |
| P6-04  | Planned  | P6-03        | 双浏览器完整比赛体验验收                                        | 三 stage、winner、领奖台、rematch、console 与视觉检查通过       |
| P7-01  | Planned  | P6-04        | gameplay fault matrix 与断线/重连/late join 加固                | 0–150 ms、0–50 ms jitter、0–5% loss 与 gap/duplicate 收敛       |
| P7-02  | Planned  | P7-01        | `bench:arena-gameplay:check` 与预算 diagnostics                 | 36-member profile 满足长期 payload/checkpoint/replay/tick 预算  |
| P7-03  | Planned  | P7-02        | 10 分钟 stage/item/bot/network/rematch soak                     | 无无界增长；dispose retained state 为 0                         |
| P8-01  | Planned  | P7-03        | 全量 review、根级门禁、benchmark 与最终浏览器验收               | `quality-and-acceptance.md` 全部条目有可复查证据                |
| P8-02  | Planned  | P8-01        | 长期文档收口、执行记录关闭和最终提交                            | 状态 `Closed`、无遗留 TODO、证据和 commit 完整                  |

## 验收记录

| 工作包 | 验收时间   | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Commit             |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P0-01  | 2026-08-11 | ADR 0051/0052/0053；GitNexus：island HIGH（16 symbols/10 direct/1 flow），Arena adapter LOW（4 symbols/1 flow）；Physics 3D Lab 可作为第二 fixture 且不引入反向依赖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `25a996c`          |
| P0-02  | 2026-08-11 | `bench:arena-prediction:check` 34 budgets passed；14-member authority p95 0.431 ms / replay-12 p95 3.927 ms；36-member authority p95 0.923 ms / replay-30 p95 11.686 ms / snapshot p95 14,242 bytes；dispose retained 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `6ed1807`          |
| P0-03  | 2026-08-11 | 8 app-local DataTypes、三 stage baseline compiler、stable generation/participant/actor/item/claim/execution/hit/KO identity；duplicate/missing ref/illegal generation fixtures；Arena 19 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `5b55195`          |
| P0-04  | 2026-08-11 | root test 92/92、build 50/50、lint 92/92、format passed；Arena regression guard 校准为 p95/capacity/correctness 门并连续两次 31/31 passed；wall-clock max 保留报告，最终 5 ms/12 ms replay 与 8 ms authority max 仍由 P7/P8 验收                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `b3ee4e3`          |
| P1-01  | 2026-08-11 | Physics Core 32/32；memory 2D/3D shared conformance、explicit rejection、wake/point/angular/checkpoint、island sort/duplicate/replay；root test 92/92、build 50/50、lint 92/92、format；physics/projectile/Arena/checkpoint budgets passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `a271adf`          |
| P1-02  | 2026-08-11 | Rapier2D 9/9、Rapier3D 8/8，同一 body-command conformance 覆盖 native impulse/point/torque/wake/rejection；root test 92/92、build 50/50、lint 92/92、format；Physics/projectile/checkpoint/Arena 31/31 与 Outpost preview/authority/client/profiles budgets passed；Arena 10 分钟 36,000 tick stability 无失败且 dispose retained 0                                                                                                                                                                                                                                                                                                                                                                                                 | `abd4163`          |
| P1-03  | 2026-08-11 | 新增 `@gamekit/character-controller` pure motor、`character.motor` DataType、compiled profile、state/command signature、有界 diagnostics/trace 与长期模块文档；9/9 契约覆盖 ground/slope/coyote/buffer/duplicate/step/platform/dive/recovery/cooldown/stagger/external impulse；root test 93/93、build 51/51、lint 93/93、format passed                                                                                                                                                                                                                                                                                                                                                                                             | `cda271b`          |
| P1-04  | 2026-08-11 | Physics island auxiliary contributor 与受限 simulation facade；Character motor typed control/remove contributor；App Host contributor factory、typed input 与 authority auxiliary projection；Physics Core 35/35、Character 11/11、App Host 45/45、root test 93/93、build 51/51、lint 93/93、format；Physics/projectile/checkpoint/Arena 31 项、Outpost 五组预算通过；Arena 10 分钟 36,000 tick 稳定且 dispose retained 0                                                                                                                                                                                                                                                                                                           | `ef852ee`          |
| P1-05  | 2026-08-11 | Arena authority/client 以同一 compiled motor、ground observation 与 auxiliary contributor 驱动玩家和 AI，并通过显式 control sequence 回放；Physics 3D Lab 提供真实 Rapier3D 第二 fixture；Character 13/13、Arena 20/20、Lab 9/9、root test 94/94、build 51/51、lint 94/94、format；Physics/checkpoint/Arena 31 项预算通过；Arena 10 分钟 36,000 tick 稳定且 dispose retained 0；浏览器实机确认 grounded、跳跃与诊断，无运行时错误                                                                                                                                                                                                                                                                                                   | `f87a441`          |
| P1-06  | 2026-08-11 | 标准 environment observer 补齐 step/ceiling/capsule clearance，motor 使用支撑面相对法向速度与坡面投影；真实 Rapier3D course 7/7 通过（坡面 4.135 m/抬升 0.838 m、0.3 m 台阶、平台误差 0.084 m、edge coyote、actor push、landing）；150 ms/9 tick authority impulse reconcile 后 Physics 与 motor signature 完全一致，重复 frame confirmed，overflow/hard correction/auxiliary failure 均为 0；Character 16/16、Arena 21/21、Lab 10/10、root test 94/94、build 51/51、lint 94/94、format；Physics、Projectile 19 项、Checkpoint 12 项、Arena 31 项、Outpost 五组预算通过；Arena 10 分钟 36,000 tick 稳定且 dispose retained 0                                                                                                        | `cd12527`          |
| P2-01  | 2026-08-11 | Arena app-local Participant Registry、Match Director 与 compiled Stage Rule 已拆分并接入真实 Room authority；Registry 覆盖 8 种 status、唯一 slot/actor/peer、容量、断线恢复、rematch reset、有界 trace 与 dispose；Director 覆盖 lobby/countdown/running/results/rematch、phase/stage instance、deadline 与 action trace，并禁止 stage-start 同 tick 空 roster 结算；Stage Rule 覆盖 qualifier deadline、final last-standing 与非法 active set；Arena 27/27、Room/Rapier regression 通过；root test 94/94、build 51/51、lint 94/94、format                                                                                                                                                                                         | `d86d7b2`          |
| P2-02  | 2026-08-11 | 纯 Ranking Policy 按 qualifier/brawl/final 文档键稳定排序，生成 placement/qualified/eliminated/winner 与 timeout-tiebreak；kill-volume eliminated 在排序前失去 eligible，authority 仅保留每 participant 一条有界空间摘要；Impact Ledger 按 hit ticket/elimination id 去重，覆盖 retention/KO/assist window、threshold、distinct assist、environment fallback、capacity/reset/dispose，并已接入淘汰/结算路径（P3 Combat 前不伪造玩家 KO）；Arena 32/32、真实 Room countdown→running 通过；root test 94/94、build 51/51、lint 94/94、format                                                                                                                                                                                           | `461bc1d`          |
| P2-03  | 2026-08-11 | Match Director 消费三条 compiled stage rule 并发布 prepared/started/completed/rematch action；每 stage 安装独立 generation 与 qualified actor set，淘汰 actor 同 tick despawn 且后续 baseline 不复活，final winner 保留到 results；schema v4 公开 match identity/deadline、participant status/binding/revision 与有界三阶段 settlement，并校验 frame/match membership revision；客户端 playback/prediction/effect 共用 frame generation；headless 16,020+ fixed ticks 验证 8→6→3→1、late join next-match spectator、active disconnect/reconnect 原身份恢复；双浏览器实机确认 running late join 为 spectator 且无 actor/input 席位；Arena 36/36 及全仓门禁通过                                                                       | `f84ad59`          |
| P2-04  | 2026-08-11 | 同一 headless authority fixture 完成 8→6→3→1 三阶段并越过 final results 进入 `match.2`；唯一 winner 与 final settlement 一致，rematch 清空 winner/stage results/eliminated set、恢复 8 actor lobby baseline，match/stage generation 不复用且 frame/match membership revision 一致；新增 dispose 后 retained-state 诊断，participant、Physics member/history/command、impact、input/ack、control/effect、ranking/entrant/result 与 cached snapshot 全部为 0；Arena 36/36 及阶段关闭全仓门禁通过                                                                                                                                                                                                                                      | `0422a81`          |
| P3-01  | 2026-08-11 | `arena.item` DataType 补齐 shape/material、CCD/speed/lifetime/bounce、carry socket/modifier/drop、action timing/charge/launch/impulse/radius、respawn、presentation 与 network strategy；compiler 验证 definition/spawn/strategy/容量并生成 stage manifest；有界 authority runtime 覆盖 world→pickup-pending→carried→windup→released/melee-active/triggered→spent→cooldown→respawning→world、generation、stale command、幂等 result、stage reset、trace 与 dispose retained 0；item/content 8/8 及全仓门禁通过                                                                                                                                                                                                                      | `185ebb3`          |
| P3-02  | 2026-08-11 | schema v5 公开 bounded item/action projection；可靠离散 action lane 与 continuous input 分离；authority 重算 target 并按 tick/sequence/distance/participant 稳定裁决；carried item despawn，drop/throw 递增 generation 并生成 Rapier/Memory Physics member；`arena.item-carry` stateless auxiliary 与 Character Motor 同 tick replay；双 client 同 tick claim→唯一 owner→drop g2→reclaim→windup→throw g3 fixture、carry modifier、真实 Colyseus/Rapier room、Arena 47/47；root test 94/94、build 51/51、lint 94/94、format 与 world benchmark 通过（10k entities：spawn 27.24 ms、query/update 30.93 ms）；浏览器实机画面/输入提示/telemetry 正常，无 runtime error                                                                 | `0cf9008`          |
| P3-03  | 2026-08-11 | Arena authority 复用标准 GAS runtime、Combat runtime 与 ability-delivery bridge；schema v6 公开 bounded combat actor/hit projection；item execution/contact 生成稳定 delivery，Combat/GAS 去重并提交 instability，Character Motor 合并一次性 stagger，Physics island 下一 tick 消费线性 impulse，Impact Ledger 保持 Match 出界后唯一 KO/assist owner；专属 fixture 覆盖 duplicate hit、instability、stagger merge、单次 impulse 与 participant KO attribution；Arena 48/48、root test 94/94、build 51/51、lint 94/94、format 与 world benchmark 通过（10k entities：spawn 12.47 ms、query/update 6.37 ms），reset/dispose hit 与 pending impulse 为 0                                                                               | `e2d6b1a`          |
| P3-04  | 2026-08-11 | 标准 Arena predictor 新增相关性驱动的 predicted-member register/reject lifecycle，并把 authority app snapshot 提供给 definition/spawn resolver；Arena use/drop 共用 release builder，先行生成 item Physics member，再以 item action/hit journal 对 authority action 与 Combat hit 去重收敛；ghost registration 在 membership mismatch 后 hard correction 移除。App Host 45/45、Arena 50/50、90 ms/35 ms jitter/8% loss/25% duplicate simulator 覆盖 event/member once-only 与 bounded journal；root test 94/94、build 51/51、lint 94/94、format 通过；独占 Arena prediction benchmark 31/31 budgets passed，target-36 authority p95 0.928 ms、replay-30 p95 10.548 ms、dispose retained 0                                           | `0921037`          |
| P4-01  | 2026-08-11 | Arena Course Data补齐bounds/static/hazard/prop/volume/Nav/presentation placement；纯compiler稳定生成Physics environment与stage members、NavMesh source/layout、presentation read model、validation probes和layout/schedule signature；三关static environment合并，placement/source id贯穿三种投影，默认编译结果缓存为authority/client/protocol/visual唯一事实源，frame definition version改由内容signature派生。编译契约验证两次独立registry完全一致、任一placement变化会改变signature；Arena 52/52；root test/build/lint均94/94、format通过；world benchmark 10k entities spawn 14.36 ms/query-update 5.63 ms；Arena prediction 31/31 budgets passed，target-36 authority p95 1.208 ms/replay-30 p95 17.206 ms，dispose retained 0 | `9f50d36`          |
| P4-02  | 2026-08-11 | Stage generation install plan原子despawn旧course members、spawn当前stage members、归零并放置晋级actor；authority/client共用绝对stage tick hazard sampler，覆盖sweeper/platform/piston phase与next transition；Circuit Forge 8个start、两级checkpoint和finish route均在bounds/Nav source内，checkpoint单调推进，前6人完成即可qualification-reached提前结算，deadline仍为后备。新增stage-course 3项与Match Director完成门契约；Arena 56/56；root test/build/lint均94/94、format通过                                                                                                                                                                                                                                                   | `79fe072`          |
| P4-03  | 2026-08-11 | Shared hazard runtime把conveyor、wind、launch pad与shrinking zone投影为可重放Physics body command，crumble floor和safe zone按stage总进度单调收敛；authority/client继续共用同一schedule与body-command planner。新增纯forced-convergence policy：Scrap Yard从55%进度起缩圈并按稳定距离顺序淘汰至3人，Crown Collapse从25%起收敛且永远保留最后1人，82%后即使玩家龟缩也确定性结束；Stage Rule新增field-reduced完成原因。权威服完整三关fixture验证旧关成员原子移除、Scrap/Crown真实安装、6→3→1稳定排名、唯一winner和rematch清理；Arena 61/61；root test/build/lint均94/94、format通过；world 10k spawn 21.65 ms/query-update 7.07 ms；Arena prediction 31/31，target-36 authority p95 1.577 ms/replay p95 15.903 ms，dispose retained 0   | `609e30c`          |
| P4-04  | 2026-08-11 | Course compiler接入同步硬门validator，稳定issue覆盖spawn/item bounds与clearance、capacity/pool、route order、kill/safe/objective volume、hazard bounds/schedule、projection、Navigation source和forced convergence；独立`validate:content`使用真实Recast WASM烘焙三份polygon artifact，并按controller radius/height/slope通过Circuit 24条分段路线、Scrap 6条目标路线、Crown 3条安全区路线。校验发现并修复三组spawn初始穿透、Circuit终点台不可跨越、Scrap 0.7 m非法台阶和Crown外岛断路；Arena 64/64，root test/build/lint均94/94、format通过；Navigation benchmark 7/7 budgets passed，1k agents sample 1.636 µs、1k request burst 116.7481 ms、dispose retained 0                                                                   | 本工作包提交时补录 |

## 分阶段实施细节

### P0：决策与基准

1. 为上述三个公共缺口分别完成影响分析和 ADR；公共 API 未通过 review 前不写 Arena 私有替身。
2. 记录当前 14-member Arena 的 authority step、snapshot bytes、checkpoint/history 和 replay p50/p95/max。
3. 建立目标 profile：8 actor、16 dynamic/item、12 kinematic/hazard，作为 36-member 正确性与性能基线。
4. 定义 Arena app-local DataType：match rule、stage、course、hazard、item、motor profile、bot archetype、spawn set。
5. 明确稳定 identity/generation：participant、actor、item、pickup claim、attack execution、hit ticket、KO credit。

### P1：Physics command 与角色控制器

1. 先实现 memory backend/conformance，再接 Rapier2D/3D body command；任何 native capability 差异进入 diagnostics。
2. 角色控制器按 ground sensing → intent shaping → motor state → body command 顺序 tick；不读取 Renderer/camera native state。
3. camera-relative 输入由 app 把相机 yaw 转成 intent；controller 只消费归一化 world/local desired direction。
4. motor checkpoint 与 Physics island 同 tick replay，测试 coyote、jump buffer、platform、dive、stagger 中途 reconcile。
5. 用专门 controller course 验收平地、坡、台阶、移动平台、边缘、推挤、落地和高延迟输入。

### P2：赛事 authority

1. 拆出 app-local match director、stage rule、ranking projector 和 participant registry，禁止继续扩大单个 authority 文件。
2. 参与者状态显式区分 active、qualified、eliminated、spectator、next-match、disconnected。
3. 每个 stage 使用新 generation；晋级/淘汰改变 membership revision，并安装完整 baseline。
4. KO credit 使用最近有效 authority impact 的有界窗口；环境淘汰、disconnect、timeout 和平局都有稳定 reason/tie-break。
5. Snapshot 复制公开排名和结果事实，不复制 director 内部候选/计时缓存。

### P3：道具与物理战斗

1. Item runtime 拆分 definition compiler、authority state machine、interaction targeter、Physics lifecycle、Combat bridge、projection。
2. Interaction 用 overlap/shape cast + stable sorting 选择候选；pickup claim 按 tick/sequence/participant id 稳定裁决。
3. Carried item 从 island despawn；throw/drop 使用 stable item generation spawn，并匹配 owner predicted spawn。
4. GAS execution 管理 windup/commit/recover/cooldown，Combat 管理 melee/area/projectile hit 与 effect 去重。
5. Arena impact policy 把 contact/Combat 空间事实映射为 instability、stagger 和 Physics impulse；淘汰仍只在 authority。
6. effect journal 覆盖 pickup、windup、throw、impact、stagger、KO 的 anticipate/confirm/cancel/replace。

### P4：场景与内容

1. Course definition 同时生成 authority/client Physics layout、Navigation source、presentation placement 和内容校验 probe。
2. 静态 geometry 不进入每帧 payload；kinematic schedule 由 stage seed + tick 确定性计算。
3. 所有动态/kinematic 接触成员进入 island；装饰只进 Renderer，不能形成隐形 blocker。
4. Joint-like 机关使用可验证的 kinematic 设计；需要真实 constraint 的内容推迟到 Physics constraint ADR 后。
5. Validator 检查 spawn clearance、required route、kill volume、item overlap、hazard phase 和 stage 强制收敛。

### P5：AI

1. AI Core 只安装在 authority；为 Arena 注册 sensor/input/task executor 和 DataPack，不复制一套 bot runtime。
2. 资格赛使用 Recast/static route + portal traversal；动态机关与其他玩家通过 local steering/hazard timing 修正 intent。
3. Perception/decision/path request 按 stable bucket 错峰，Physics/character controller 保持 60 Hz。
4. 对目标 churn、道具争抢、边缘攻击、stuck、item unavailable、path stale 和 stage change 做 deterministic fixture。
5. DevTools 可查看 goal score、task phase、目标、route、失败原因和 budget delay，但不复制完整 AI blackboard 给客户端。

### P6：表现与 UX

1. Animator graph 覆盖 idle/run/jump/fall/dive/carry/windup/throw/melee/stagger/eliminated；gameplay timing 不等动画 marker。
2. Audio event 覆盖脚步材质、机关、pickup、windup、impact、crowd、qualification/KO/result，并限制并发/优先级。
3. Camera 处理速度 look-ahead、碰撞、item aim、dive/impact shake、淘汰后 spectator target，display state 不写回 simulation。
4. HUD 展示 stage objective、晋级线、携带道具、instability、存活数、KO feed、spectator 和最终领奖台。
5. 远端/late join 根据 authority phase 恢复动作和音频状态，不从头重播过期 one-shot。

### P7：网络与性能加固

1. 扩展 fault matrix：pickup 冲突、held owner change、predicted throw、bounce/area impact、stage revision、late join、reconnect。
2. 新增 `bench:arena-gameplay:check`，覆盖 character、items、Combat/GAS、AI、Navigation、projection 和 replay 的真实组合。
3. Profile snapshot payload、checkpoint bytes、history、command count、hard correction、GC/heap 和 authority/client tick。
4. 先优化定义编译、临时分配、query batching、trace retention 和内容上限；不能通过移除仍可碰撞成员伪造性能通过。
5. 10 分钟 soak 包含 stage churn、item spawn/despawn、bot 决策、network fault 和 rematch，dispose 后 retained state 为 0。

## 验收预算

长期预算、测试矩阵、network fault、benchmark 和 soak 标准见
[`quality-and-acceptance.md`](../apps/multiplayer-physics-arena-demo/quality-and-acceptance.md)。各阶段在此记录实际命令、测量、
失败、rework 与 commit。

关闭前至少运行：

```bash
corepack pnpm test
corepack pnpm build
corepack pnpm lint
corepack pnpm format
corepack pnpm bench:world
corepack pnpm bench:physics:check
corepack pnpm bench:combat:check
corepack pnpm bench:multiplayer:check
corepack pnpm bench:checkpoint:check
corepack pnpm bench:arena-prediction:check
corepack pnpm bench:navigation:check
corepack pnpm bench:ai:check
corepack pnpm bench:animator:check
corepack pnpm bench:audio:check
corepack pnpm bench:arena-gameplay:check
```

最后一条命令属于本工作流交付物，在 P7 前不存在时不得假装已运行。

## Review 与提交规则

- P0–P8 每个阶段独立实现、review、测试和提交；不能用一个大型提交同时改变 Physics、App Host、Arena 和内容。
- 修改公共 API 前必须运行 GitNexus upstream impact；HIGH/CRITICAL 先报告并补消费者回归。
- 每个 framework gap 先完成 ADR、公共协议、conformance 和第二 fixture，再迁移 Arena；Arena 不保留同名私有替身。
- 每个 app-local runtime 都要声明 authority/prediction/presentation 所有权、容量、reset、dispose 和 trace。
- 提交前运行 GitNexus detect changes；工作流结束时迁移长期结论、记录最终命令与 commit，并把状态改为 Closed。
