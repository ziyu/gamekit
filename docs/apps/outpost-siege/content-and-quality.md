# Outpost Siege 内容、存档与质量

## 内容事实源

所有内容从 DataPack → DataRegistry 进入 runtime。Game system 不维护与 DataRegistry 平行的武器、技能、敌人、设施、波次、动画或资源常量表。

## DataType 划分

| 类型                                        | 主要职责                                                         |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `outpost.player`                            | actor、movement、weapon slot、module slot、presentation          |
| `outpost.weapon`                            | fire/reload 规则、Combat delivery/projectile、animation/cue refs |
| `outpost.tactical-module`                   | GAS execution/effect、Combat delivery、presentation refs         |
| `outpost.enemy`                             | actor、Physics、AI definition、abilities、rewards、presentation  |
| `outpost.buildable`                         | price/capacity/socket、actor、Physics、AI/Combat、presentation   |
| `outpost.encounter`                         | gates、timeline、budget、limits、objectives、scale curve         |
| `outpost.objective`                         | activation/progress/success/failure、HUD/world marker            |
| `outpost.protocol`                          | eligibility、vote presentation、GAS/TCA/policy effect            |
| `outpost.arena`                             | scene instances、zones、gates、sockets、targets                  |
| `combat.delivery/projectile`                | 通用 effect delivery 与 projectile definition                    |
| `ai.agent/goal/task/sensor`                 | 通用 AI graph 与 app-registered definition refs                  |
| `navigation.layout/profile`                 | route graph、area、portal、blocker、agent profile                |
| `animation.clip` / `animator.graph/binding` | clip asset、semantic graph 与 render target binding              |
| `gas.actor/ability/effect/cue`              | 属性、执行阶段、效果、状态和语义 cue                             |
| `physics.body/collider/layout`              | body、shape、filter 和场景 materialization                       |
| `render.object`                             | render tree、asset slots、layer 与 backend type                  |
| `asset.definition`                          | image、atlas、spritesheet、audio、font、shader 等资源            |

引用必须进入 Data reference graph。错误包含 source pack、type、id、field path 和 target，不能到 runtime 才以 `undefined` 或 Phaser missing texture 失败。

## 数据扩展规则

- 数值变化、新 weapon/enemy/buildable/protocol 只增加 data entry。
- 新 delivery、AI sensor/consideration/task 或 presentation cue type 才注册 executor/definition。
- Executor 使用稳定 type，不通过具体 content id switch。
- Data normalize/default 只补语义安全默认，不隐藏缺失的重要 timing、shape、effect 或 asset。
- Load 阶段预编译 AI score curve、Animator graph、TCA rule、GAS definitions 和 encounter timeline。

## Asset 工作流

```txt
source art / audio outside runtime public root
  -> deterministic import/build
  -> crop / normalize / atlas / compress / audio variant
  -> manifest with dimensions, frames, pivots, sockets, duration
  -> asset.definition + group
  -> AssetManager validation/load/retry
  -> Driver shared cache
  -> Animator/Renderer/Audio binding
```

Preload group：

- `boot`：logo、font、最小 UI。
- `match`：arena、player、核心、常用 UI/audio。
- `combat`：普通敌人、武器、模块、设施与常见 VFX/audio。
- `boss`：Overseer atlas、首领 VFX/music，可在 Wave 2 前 lazy preload。

Headless server 注册并校验相同 DataPack 与 AssetRef，但不加载纯视觉/音频 binary。

Atlas/audio variant、pixel ratio 与低效果 profile 通过 AssetRef variant 或 profile policy 选择，不在 gameplay definition 保存 URL。

## 游戏模块拆分

App-local modules：

- Match Flow / phase / win-loss。
- Player loadout/control/weapon state。
- Encounter Director / spawn / boss phase。
- Core/Node objective。
- Shared Supply / construction / repair / protocol vote。
- Outpost relationship/damage policy。
- Enemy role definitions、AI sensors/considerations/tasks。
- Arena materialization 与 identity registry。
- Authority projection / Colyseus Schema decoder。
- Cue presentation mapping 与 React view-model bridge。

Reusable modules：

- World、Physics、GAS、TCA、Combat。
- AI Core、Navigation Core。
- Multiplayer Core managed replication。
- Animator Core、Renderer、Audio、Camera。
- Data、Asset、Save、UI、DevTools。

App-local module 可以注册 reusable definition/policy，但不能复制相应 Core runtime。

## Checkpoint / Save

Authority checkpoint 发生在安全整备边界，也支持 deterministic test 显式捕获。保存：

- match seed/clock/phase instance/deadline。
- World 可保存 entity 与 stable identity mapping。
- Physics 可恢复 body/collider state。
- GAS actor、ability execution、effect、cooldown、tag、attribute。
- Combat 跨 checkpoint projectile/hit state（若 policy 允许）。
- AI active goal/task/minimum memory、Navigation route key/revision。
- TCA once/run state。
- wave/objective/core/node/Supply/facility/protocol/vote summary。

不保存：

- socket/Room/reconnect token/input/action queue。
- prediction/playback/interpolation/correction buffer。
- Physics query/contact cache、Navigation open set/cache。
- Animator controller/native animation clip/frame/marker history。
- Audio voice、particle、RenderObject、React focus/hover。
- DevTools timeline 或完整 trace。

Restore 顺序：Data/Asset compatibility → World/identity → Physics → GAS/Combat/TCA → AI/Navigation → app match state → participant binding → replication → presentation rebuild。

固定 seed 下 restore 后继续 simulation 必须与未中断 authority 得到等价 stable gameplay snapshot。

## 自动化测试层级

### Unit / Contract

- Data normalize/validate/reference/index。
- GAS execution phase/cancel/commit，Combat delivery/projectile/hit。
- AI score/hysteresis/task/interrupt，Navigation path/revision/cache。
- Animator graph/phase 与 animation marker，Audio concurrency/dedupe。
- Economy transaction、vote、phase transition、objective。

### Headless Integration

- Input/AI → GAS → Combat → Physics → Effect → TCA → objective 全因果链。
- 全部波次、boss、extraction、win/lose。
- 1/2/3/4 人固定 seed 缩放。
- Checkpoint capture/restore/continue。
- Late join/reconnect/leave/room dispose fixture。

### Real Backend Integration

- Rapier projectile/shape cast、character collision、facility/blocker。
- Colyseus Room 多客户端、Schema projection、source validation、resync。
- Phaser atlas/animation/particle/audio/camera/viewport。
- React focus/input scope、横屏/竖屏/reduced motion。

### End-to-End Playtest

- 单人完整一局。
- 双客户端完整一局，至少一次救援、建造、protocol 与撤离。
- 四客户端压力局与一个中途 disconnect/reconnect。
- 失败路径：核心摧毁、全员失能。
- 节点全保/全失、设施被毁、boss 各阶段、成员未进撤离区。

## Benchmark 预算语义

具体阈值由可复现基线生成；每个 benchmark 必须明确规模、时间单位、trace/profile 和 retained-state 条件。

| Benchmark          | Normal profile                                   | Stress profile                              | 主要指标                                         |
| ------------------ | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------ |
| Authority combat   | 4 player、250 enemy、300 projectile、64 facility | 1,000 enemy、1,500 projectile、256 facility | tick p50/p95、allocation、query、effect、cleanup |
| AI scheduler       | 250 active agent                                 | 1,000 mixed-LOD agent                       | perception/decision/task/path delay、spike       |
| Navigation         | 250 route sample、有限 blocker change            | 1,000 sample、path burst、revision churn    | queue、cache hit、path latency、retained         |
| Client replication | 4 player + 250 enemy + projectile/facility       | stress entity projection                    | decode/apply/frame write、state size、GC         |
| Animator/render    | 300 visible/500 controller                       | 1,000 mostly-idle controller + effect burst | graph update、backend writes、draw/fill/texture  |
| Audio/cue          | normal rifle/enemy/ability mix                   | cue burst                                   | active voices、steal/reject、dedupe、retained    |
| UI                 | 4 roster、HUD、notification                      | reconnect + results + rapid status          | React commits、selector rate、layout/paint       |
| Checkpoint         | normal profile capture/restore/first tick        | large entity/effect/AI state                | duration、payload size、equivalence、retained    |
| Soak               | 4 player、60 minutes、reconnect/entity churn     | multiple room                               | heap slope、GC、event-loop lag、dispose          |

Benchmark 不只测平均 tick。AI bucket、wave spawn、boss transition、mass death、snapshot、asset preload 和 UI transition 的尖峰需要单独 span。

## 可玩性持续标准

- 不读开发文档可以从 Title 完成一局并重赛。
- 进入战场 30 秒内完成射击、识别核心/入口和一次有效位置决策。
- 移动、aim、fire、reload、dash、tactical、build、repair、revive、protocol 和 extraction 均有实际用途与完整反馈。
- 敌人可靠导航、预兆、攻击、受击、控制、死亡；不会大规模卡墙、冻结或无提示同时命中同一玩家。
- 画面物体、Physics collider、Navigation blocker 与 socket 对齐。
- 本地表现响应、远端 playback 连续；游戏代码不显式调用 interpolation/prediction/reconciliation。
- Animator、VFX、Audio、Camera 和 UI 能解释 gameplay phase，关闭/失败时不改变 authority。
- 单人和 2–4 人均能从 Lobby 到 Results，不出现血量海绵、资源 soft lock 或投票阻塞。
- 横屏、窄屏、竖屏下 Camera 中心、HUD 与世界坐标正确。
- Disconnect/reconnect、late join、down/revive、资源不足、authority reject 与失败原因可理解。
- Match 不会因残留 enemy、path failure、cue loss、断线席位、资源加载或 stale phase 永久卡住。

## DevTools 观察面

DevTools 关联：

```txt
input/AI intent
  -> GAS execution phase
  -> Combat request/projectile/hit
  -> Physics query/contact
  -> GAS effect/attribute/tag
  -> TCA reaction/objective
  -> AI task/director transition
  -> replication/cue
  -> Animator/Renderer/Audio/Camera/UI
```

默认只保留有界 summary。选中 entity/correlation 后按需展开 AI score、path、ability、projectile 与 cue 详情。任何 observer、trace hook 或 panel error 都不能改变 gameplay。
