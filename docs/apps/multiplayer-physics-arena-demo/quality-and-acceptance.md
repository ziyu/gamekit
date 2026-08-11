# Knockout Arena 质量与验收标准

## 目标

Knockout Arena只有在功能闭环、多人故障、Physics/AI性能、内容有效性、表现可读性和资源清理同时通过时才称为完整游戏。
单一happy-path截图、离线memory backend测试或“能创建房间”不能替代完整验收。

本文是Arena长期质量门和预算的唯一事实源。Implementation文档只记录某次执行状态、命令结果和提交，不复制预算。

## 功能验收

- 2个真实浏览器玩家与6个authority bots可以从lobby完成三stage，产生唯一winner并rematch。
- Stage 1按finish/checkpoint/progress选6人；Stage 2按存活/objective/KO选3人；Stage 3最后存活者获胜。
- 当前stage淘汰者从Physics island移除并进入spectator，不重生、不保留collider；下一stage只恢复晋级者。
- Late join进入next-match；disconnect/reconnect/forfeit不会复制participant或复活淘汰者。
- 键鼠与standard gamepad都能移动、camera、jump、dive、pickup、use、charge、throw、drop和spectate。
- Ground/slope/step/moving platform/coyote/jump buffer/dive/stagger/carry在真实Rapier3D场景行为稳定。
- 四类道具完成world→pickup→carry→use/throw/drop→spent/respawn；双人争抢只有一个owner。
- 10类机关/表面有可读预兆、正确collision/volume和稳定schedule；三个stage可完成并能强制收敛。
- Bots能路线推进、避险、争抢道具、攻击脆弱目标、恢复stuck，并与玩家使用同一intent/authority校验。
- HUD、spectator、stage/match results能解释晋级、淘汰、KO/environment、item和winner因果。

## 行为不变量

- Authority-only事实不会因client replay、duplicate snapshot、reconnect或late join重复提交。
- 所有会影响本地接触因果的dynamic/kinematic body位于完整island；static layout由相同version重建。
- Remote actor/AI持续control与local input使用同一motor replay；不能只预测本地actor。
- External impulse不被motor下一tick清零；stagger/recovery和item generation可确定重演。
- Carried item没有隐藏collision；predicted pickup/throw reject后完全恢复authority事实。
- Renderer/Animator/Audio/Camera/UI不写回Physics、Match、Item、Combat或AI。
- Stage/match reset清理旧input epoch、history、member、motor、item、Combat/GAS、AI/Nav、effect、presentation和resource。

## 测试层级

### Unit

- Match phase/ranking/tie-break/qualification/elimination/rematch。
- Character motor intent shaping、timers、ground/slope/step/platform、dive/stagger。
- Item state machine、claim sorting、carry modifier、charge/throw、generation/respawn。
- Instability/impact/stagger/KO attribution与duplicate hit suppression。
- Hazard schedule、surface/volume ticket、course compiler和validator。
- AI perception/utility/hysteresis/task/failure/stuck/scheduler。
- Presentation mapping、effect identity、late-join phase和UI view model。

### Conformance

- Physics body command：memory、Rapier2D、Rapier3D的impulse/order/checkpoint/replay。
- Character Controller：memory query fixture和真实Rapier3D controller course。
- Arena auxiliary replay：Physics+motor同tick reconcile/reset/overflow/dispose。
- Item predicted lifecycle：pickup despawn、throw spawn match/reject/generation。
- AI/Navigation/Combat/GAS/Animator/Audio使用各自公开conformance，不建Arena私有替身。

### Integration

- 真实Rapier3D+Colyseus Room+2 clients，共享authorityPhysics/Match/Item/Combat/AI/Nav runtime。
- 两人同tick pickup、连续throw/contact、stage member churn、late join、disconnect/reconnect和rematch。
- Headless authority能完成整场match，不安装Three/Animator playback/Audio/React/DOM。
- Authority/client Course compiler的layout/member/schedule signature一致。

### Browser

- 两个独立页面Create/Join同一session，分别绑定player slot并完成三stage。
- 键鼠和gamepad输入scope正确；room/telemetry/text/modal不误触发gameplay。
- 视觉朝向、camera、hazard warning、carried item、impact、spectator、results一致且可读。
- Console无application error；上游明确deprecation可单独记录但不能掩盖runtime error。
- 1080p、viewport resize、高DPI和窄窗口下主视图/HUD/telemetry不互相破坏。

## Network Fault Matrix

| One-way latency | Jitter | Input loss | Snapshot                 | 验收重点                                        |
| --------------- | ------ | ---------- | ------------------------ | ----------------------------------------------- |
| 0 ms            | 0 ms   | 0%         | normal                   | confirmed为主，无持续correction/hard correction |
| 50 ms           | 20 ms  | 0%         | normal                   | control即时、replay有界、pickup/throw一次执行   |
| 100 ms          | 30 ms  | 2%         | 3-frame gap              | 不穿已知blocker，不重复jump/hit/item/effect     |
| 150 ms          | 50 ms  | 5%         | 8-frame gap+duplicate    | history内收敛，超预算明确baseline               |
| 任意            | 任意   | 任意       | stage/revision/reconnect | 丢弃旧input/member/item/effect generation       |

额外场景：

- 双人同tick争抢同一item。
- Owner在windup/throw前后disconnect。
- Predicted throw与authority起点/方向分叉。
- Bounce/fuse/area impact跨snapshot gap。
- Elimination与item contact同tick。
- Stage transition期间到达旧input/action/snapshot。
- Late join安装当前stage而非重播match起点。

每个测试分别观察authority received/consumed、client observed ack、generation/revision、item/action result和effect settlement。

## 性能与容量预算

默认正确性profile为8 actor、16 dynamic/item和12 kinematic/hazard，共36个可交互member。12 participant stress profile可以
扩大member，但必须使用显式独立预算。

| 指标                  | 默认目标                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| Authority fixed step  | 36 member主线程CPU p95≤4 ms、p99≤8 ms；wall p95/max同时报告                  |
| Client replay         | 主线程CPU：12-tick p95≤5 ms、30-tick p95≤12 ms；wall p95/max同时报告         |
| Snapshot payload      | 20 Hz，36 member+gameplay facts p95≤32 KiB，hard max 64 KiB                  |
| Checkpoint            | 单checkpoint≤512 KiB                                                         |
| History               | 单client完整arena history≤96 MiB                                             |
| Input lead/replay     | lead、command、single replay work全部有硬上限；正常网络无持续hard correction |
| AI                    | 8 bots感知/决策/path不超过authority step预算20%，无同帧全量重评尖峰          |
| Browser frame         | 1080p目标60 FPS；gameplay主线程p95 frame≤16.7 ms                             |
| Presentation capacity | actor/item/hazard/effect/audio/render object均有定义硬上限和LOD              |
| Stability             | 10分钟soak无无界heap/history/trace增长，dispose retained state=0             |

任何预算放宽都需要真实profile测量、瓶颈解释和review；不能通过删除仍会碰撞的member、关闭replay/trace必需路径或减少验收
功能伪造通过。

## Benchmark

持续运行：

- World/Physics/Checkpoint/Multiplayer/Arena prediction。
- Combat projectile/area/melee与item churn。
- Navigation route/revision和AI 8/12 bot profile。
- Animator/Audio/diagnostics production+retention。
- Arena gameplay综合profile：character+item+Combat/GAS+AI/Nav+projection+replay。

Benchmark排除一次性fixture construction但包含真实tick/runtime行为；同步 JS/WASM 工作使用当前线程 CPU 时间作为跨负载硬门槛，
同时记录 wall-clock p95/max、allocation/heap、payload/checkpoint/history、capacity rejection和dispose retained state。Browser frame
继续使用真实 wall-clock，CPU 指标不能替代视觉帧验收。

## Soak

10分钟虚拟/真实组合soak至少覆盖：

- 三stage循环与连续rematch。
- Actor/item/hazard spawn/despawn和membership revision churn。
- 8 bots perception/decision/path/task和item interaction。
- Continuous input/redundant bundle/snapshot/reconcile/effect settlement。
- Network latency/jitter/loss/duplicate和snapshot gap切换。
- Presentation resource、Animator controller、Audio instance和spectator target churn。

结束后Physics member/history/command、motor state、item map/ledger、Combat ticket、GAS execution/effect、AI memory/task、Nav route、
effect journal、render/audio资源均回到声明的idle/disposed上限。

## Content Quality

每个stage/course pack通过：

- Schema/ref/version/signature和required asset compatibility。
- Spawn clearance、required route、slope/step/profile和finish/checkpoint顺序。
- Hazard任意phase安全性与sudden-death强制收敛。
- Kill/safe/objective/item volume合法性和collision/presentation对齐。
- Item/network/action/effect/body引用、lifetime/capacity完整。
- Bot route/portal、item候选和stuck recovery fixture。

内容测试在构建/CI运行，不把昂贵几何分析放入每局启动。

## Review 与发布门

- 修改公共Physics/Character/App Host/Multiplayer协议前运行upstream impact；HIGH/CRITICAL先报告并补消费者回归。
- 每个公共能力先conformance+第二fixture，再让Arena迁移；完成后删除app同名替身。
- 每个app-local runtime声明owner、capacity、reset/dispose、trace和authority/prediction/presentation边界。
- 提交前运行GitNexus detect changes，确认玩法概念未泄漏Core、native type未泄漏业务API。
- 完整验收至少运行全仓test/build/lint/format和相关全部benchmark；具体执行证据与commit写入implementation工作流。
