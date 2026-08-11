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
| P1：Physics command 与角色控制器 | Active   | Core/adapter command、character toolkit、键鼠/gamepad、player/AI shared intent    | Rapier3D controller course；prediction replay 一致 |
| P2：赛事 authority               | Planned  | 多 stage 状态机、participant/qualification/spectator、winner/tie-break、TCA facts | headless 8 人完整 match/rematch                    |
| P3：道具与物理战斗               | Planned  | Item runtime/DataType、pickup/carry/use/throw、Combat/GAS、KO credit              | 2 client 争抢同一道具；无重复消费/命中             |
| P4：场景与内容                   | Planned  | 3 stage、机关/表面、shared layout、Recast source/validator                        | 每场可完成；无不可达 spawn/goal                    |
| P5：AI                           | Planned  | Arena sensors/goals/tasks/archetypes、Navigation/steering、AI trace               | bots 能晋级、拾取、攻击、避险且不作弊              |
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
| P1-02  | Active   | P1-01        | Rapier2D/3D body command 映射                                   | 两个 adapter 通过同一 conformance；native capability 有诊断     |
| P1-03  | Planned  | P1-02        | `@gamekit/character-controller` pure motor、Data 与 diagnostics | ground/coyote/buffer/slope/step/platform/dive/stagger 单元契约  |
| P1-04  | Planned  | P1-03        | 标准 Arena auxiliary replay contributor                         | Physics 与 motor 同 tick capture/restore/replay/reset/dispose   |
| P1-05  | Planned  | P1-04        | Arena 与 Physics 3D Lab 接入共享 controller                     | 玩家/AI 同 intent；旧无状态 consumer 兼容                       |
| P1-06  | Planned  | P1-05        | Controller course 与高延迟 replay 验收                          | 平地、坡、台阶、平台、边缘、推挤、落地和 reconcile 全通过       |
| P2-01  | Planned  | P1-06        | Participant registry、match director 与 stage rule              | 所有参与者状态转换合法且可 trace                                |
| P2-02  | Planned  | P2-01        | 排名、晋级、KO/assist、timeout 与稳定 tie-break                 | deterministic headless ranking fixtures                         |
| P2-03  | Planned  | P2-02        | stage generation、membership revision 与公开结果投影            | 淘汰不复活；晋级/观战/late join/reconnect baseline 正确         |
| P2-04  | Planned  | P2-03        | 8 人三阶段 match/rematch headless 验收                          | 唯一 winner、完整清理、无 retained participant/island state     |
| P3-01  | Planned  | P2-04        | Item DataType、definition compiler 与 authority state machine   | world/claimed/carried/active/spent/respawn 转换与容量契约       |
| P3-02  | Planned  | P3-01        | stable target、pickup arbitration、carry、drop/throw Physics    | 两客户端同 tick 争抢只产生一个 owner；generation 稳定           |
| P3-03  | Planned  | P3-02        | Combat/GAS delivery、instability、stagger、knockback、KO bridge | 命中去重、冲击归因与 authority 淘汰 fixture                     |
| P3-04  | Planned  | P3-03        | 道具预测、effect journal 与 fault matrix                        | loss/duplicate/gap 下无重复消费、命中、cue 或幽灵 body          |
| P4-01  | Planned  | P3-04        | Course 编译器、共享 Physics/Nav/Presentation projection         | 相同 definition version 生成一致 stable ids 与空间事实          |
| P4-02  | Planned  | P4-01        | Circuit Forge 资格赛与 controller course                        | 8 人均存在可完成路线，机关时序确定且无隐形 blocker              |
| P4-03  | Planned  | P4-02        | Scrap Yard 与 Crown Collapse、道具/机关/强制收敛                | 两个 stage 可完成并在超时前产生稳定排名/唯一 winner             |
| P4-04  | Planned  | P4-03        | 内容 validator、Navigation source 与全 stage 验收               | spawn/route/clearance/kill volume/item/hazard/convergence 校验  |
| P5-01  | Planned  | P4-04        | Arena perception、memory、profile 与 archetype Data             | Bot 只消费 authority 可见事实；reaction/aim/risk 可配置         |
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

| 工作包 | 验收时间   | 证据                                                                                                                                                                                                                                       | Commit             |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| P0-01  | 2026-08-11 | ADR 0051/0052/0053；GitNexus：island HIGH（16 symbols/10 direct/1 flow），Arena adapter LOW（4 symbols/1 flow）；Physics 3D Lab 可作为第二 fixture 且不引入反向依赖                                                                        | `25a996c`          |
| P0-02  | 2026-08-11 | `bench:arena-prediction:check` 34 budgets passed；14-member authority p95 0.431 ms / replay-12 p95 3.927 ms；36-member authority p95 0.923 ms / replay-30 p95 11.686 ms / snapshot p95 14,242 bytes；dispose retained 0                    | `6ed1807`          |
| P0-03  | 2026-08-11 | 8 app-local DataTypes、三 stage baseline compiler、stable generation/participant/actor/item/claim/execution/hit/KO identity；duplicate/missing ref/illegal generation fixtures；Arena 19 tests passed                                      | `5b55195`          |
| P0-04  | 2026-08-11 | root test 92/92、build 50/50、lint 92/92、format passed；Arena regression guard 校准为 p95/capacity/correctness 门并连续两次 31/31 passed；wall-clock max 保留报告，最终 5 ms/12 ms replay 与 8 ms authority max 仍由 P7/P8 验收           | `b3ee4e3`          |
| P1-01  | 2026-08-11 | Physics Core 32/32；memory 2D/3D shared conformance、explicit rejection、wake/point/angular/checkpoint、island sort/duplicate/replay；root test 92/92、build 50/50、lint 92/92、format；physics/projectile/Arena/checkpoint budgets passed | 本工作包提交时补录 |

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
