# Outpost Siege 综合验证 Demo 应用设计

## 定位

Outpost Siege 是 GameKit 的全框架综合验证应用。它通过一局可持续游玩的 2D 俯视角合作防守与撤离游戏，在同一条真实产品链路中验证 Core Runtime、App Host、Data、Asset、World、Input、Camera、Physics、TCA、GAS、Multiplayer、Renderer、UI、Save、Platform 和 DevTools。

多人仍然是应用的运行前提之一，但不再是唯一验证目标。Outpost Siege 必须证明这些模块能够在一个 server-authoritative、数据驱动、实体化、物理化并可保存、可解释的游戏中协同工作，而不是分别存在于孤立实验台。

它与其他验证应用承担不同职责：

- Relay Arena 保持为小规模、可快速回归的 Multiplayer baseline。
- Physics Lab、Three Demo 等继续验证单一 backend 或 driver 的专属能力。
- Abyss Delve 继续保留自己的游戏设计和验证职责。
- Outpost Siege 验证一套完整 GameKit 应用组合是否能支撑真实多人战斗、内容资源、UI、存档、诊断和长期负载。

Outpost Siege 是应用验证面，不是核心协议来源。玩家、敌人、武器、炮塔、波次、撤离和资源等概念保持 app-local；只有经过第二个稳定场景验证的通用能力才允许下沉到 GameKit package。

## 验证合同

Outpost Siege 的完成标准不是“package 被 import 过”，而是每个核心能力都必须有真实玩法承载点、明确生命周期和自动化证据。

| 能力                      | 应用中的真实承载点                                                                       | 主要执行位置                                          | 必须形成的证据                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Core / Runtime / EventBus | 固定 seed、系统顺序、低频 gameplay facts、模块反向清理                                   | Server、client、headless test                         | lifecycle、system order、deterministic snapshot                    |
| App Host / Config         | Browser、headless room、Tauri smoke 三种 profile                                         | App composition                                       | boot/start/stop/dispose、dependency waterfall、config source       |
| Data                      | 单位、能力、效果、规则、物理、渲染和资源定义                                             | Boot / content pipeline                               | reference graph、invalid content diagnostics、source trace         |
| Asset                     | boot、match、combat、boss 分组预载与 lazy load                                           | Browser driver / headless fixture                     | load/retry/failure、group state、AssetRef trace                    |
| World                     | 所有动态 gameplay object 的 ECS state                                                    | Authority runtime；client shadow/presentation runtime | spawn/despawn、query、stable identity mapping、cleanup             |
| Input                     | movement/aim continuous input、ability/build/interact action、UI scope                   | Browser client                                        | scope/context、held state、network input/action mapping            |
| Camera                    | follow、lookahead、zoom anchor、shake、坐标转换                                          | Browser GameModule                                    | controller state、driver sync、UI/DevTools scope isolation         |
| Physics                   | movement、projectile、hitbox/hurtbox、obstacle、placement query                          | Server authority                                      | fixed step、contact/query、entity mapping、cleanup、benchmark      |
| TCA                       | 状态反应、击杀链、波次、目标、掉落和低频组合规则                                         | Server authority / local authority test               | condition/action trace、priority/once、derived event chain         |
| GAS                       | Actor、Attribute、Tag、Ability、Effect、Cue、Cooldown、Cost                              | Server authority / local authority test               | activation/rejection、effect lifecycle、trace、replicated view     |
| Multiplayer               | Room-owned authority、participant lifecycle、Schema replication、prediction/presentation | Colyseus server + clients                             | real integration、source gate、reconnect、room isolation、soak     |
| Renderer / Driver         | Phaser render objects、asset cache、native presentation path                             | Browser App Host                                      | object lifecycle、render sync、driver snapshot、frame budget       |
| UI                        | Lobby、HUD、ability/effect、build menu、results、DevTools shell                          | React UI service                                      | snapshot/selector、focus bridge、responsive/reduced-motion E2E     |
| Save                      | authority checkpoint、deterministic restore、client-local preferences                    | Headless server/test + Platform store                 | contributor order、migration、save/load/tick continuation          |
| Platform                  | Web 正式路径、headless server、Tauri desktop smoke                                       | App profile                                           | capability selection、storage/filesystem、permission/error mapping |
| DevTools                  | input→network→physics→TCA/GAS→world→cue/render→save 关联链                               | Client、server、headless test                         | correlated trace、inspectors、profiler budgets、bounded buffers    |

代表性正式组合固定为：

- Browser：Platform Web + App Host + Phaser Driver + Koota World + Colyseus client + React UI。
- Server：Headless App Host + Koota World + Rapier 2D + Colyseus Room-owned authority。
- Deterministic fixture：Headless Host + memory platform/save/renderer + memory Multiplayer 或 in-process authority。
- Desktop smoke：Platform Tauri + Phaser Driver + 与 Web 相同的 client gameplay/presentation contract。

Outpost Siege 不需要重复覆盖 Three Driver、Rapier 3D 等每个 backend 变体；这些继续由专属 Lab 和 conformance test 负责。综合 Demo 验证的是稳定 facade 和代表性 production adapter 的协作。

## 游戏体验

玩家组成最多四人的小队，在前线哨站中收集共享资源、建造防御设施、抵御多波敌人，并在最终阶段启动撤离装置。

```txt
room setup
  -> lobby / loadout / ready
  -> content preload
  -> countdown
  -> wave
  -> intermission / build / checkpoint
  -> elite or boss wave
  -> extraction
  -> results
  -> rematch or room close
```

完整玩法至少包含：

- 玩家移动、瞄准、主武器射击、冲刺和一个区域能力。
- 炮塔和路障建造，包含资源、冷却、占位、视线和物理范围校验。
- 近战敌人、远程敌人和一个具有阶段切换的 boss。
- 投射物、命中、伤害、护盾、击退、持续效果、死亡、复活和传送。
- 共享资源、唯一掉落物竞争、波次目标和撤离目标。
- Lobby、ready、results、rematch、spectator、disconnect 和 reconnect。

内容数量保持克制，但系统交互必须完整。每个玩法元素都应承担明确的框架验证职责，不能为了展示而增加绕过框架的数据或表现特例。

## Entity 与身份模型

所有可参与玩法的动态对象首先是 World entity。不同模块使用自己的稳定 id，并由 app-owned identity registry 维护映射：

| 身份                          | 用途                                  | 稳定性                           |
| ----------------------------- | ------------------------------------- | -------------------------------- |
| Gameplay object id            | 存档、关卡和业务引用                  | 跨 save/load 稳定                |
| EntityId                      | 当前 World runtime identity           | 允许 restore 时 remap            |
| GAS actorId                   | Ability/Effect/Attribute/Tag identity | actor 生命周期内稳定             |
| Physics body/collider id      | backend-neutral 物理 identity         | scene 生命周期内稳定             |
| Network entityId + generation | replication、despawn 和 track reset   | session 内稳定并防止 id 重用污染 |
| RenderObjectId                | renderer object lifecycle             | presentation 生命周期内稳定      |

玩家、敌人、炮塔、可破坏物、投射物、掉落物和区域触发器都使用 entity-backed state。队伍、波次导演和全局目标可以使用 detached GAS actor 或 app-owned runtime state，但仍必须通过稳定 snapshot、TCA fact 和 Save contributor 进入框架边界。

World component 不保存 Phaser object、Rapier handle、Colyseus Schema object、React state 或其他 backend native object。

## 权威运行模型

Colyseus Room 是在线 session 的 authority 和 server simulation 生命周期所有者。创建 room 的浏览器只取得 party leader 权限，不成为 gameplay writer。

每个 authority tick 的顺序必须固定并可诊断：

```txt
multiplayer ingress
  -> participant/input intent
  -> player movement and AI steering
  -> physics world sync and fixed step
  -> contact/query facts
  -> combat validation and GAS activation/effects
  -> TCA reactions, objective and lifecycle rules
  -> entity spawn/despawn and cleanup
  -> save/checkpoint dirty state
  -> replication projection
  -> provider Schema commit and ack
  -> diagnostics sampling
```

GameRuntime 不需要获得全局 phase catalog；Outpost app 通过明确 GameModule 安装和 system 注册顺序固定这条链，并用测试锁定。Authority helper 只负责约束 ingress 与 commit，不能在完整 gameplay tick 前推进 ack 或 provider version。

离线 deterministic fixture 与在线 server 使用同一套 app gameplay modules、DataPack 和 simulation contract。测试 transport 可以替换，但不能复制第二套 combat reducer。

## 物理化战斗系统

战斗系统建立在 World + Physics + GAS + TCA 的分层之上：

```txt
Input / AI intent
  -> authority validation
  -> GAS ability cost/cooldown/tag gate
  -> app combat action or projectile entity
  -> Physics movement/query/contact
  -> semantic hit candidate
  -> team/owner/target validation
  -> GAS effect and attribute change
  -> EventBus gameplay facts
  -> TCA reactive rules
  -> GAS cue / replicated presentation fact
```

职责固定如下：

- World 保存实体热状态、movement intent、projectile、lifetime、team、spawn identity 和 authority-owned combat bindings。
- Physics 只决定空间、运动、碰撞、trigger 和 query；不决定伤害、阵营、暴击或技能结果。
- GAS 决定 Actor、Attribute、Tag、Ability、Cost、Cooldown、Effect、Cue 和可解释的 activation/rejection。
- TCA 决定低频反应和组合规则，例如护盾破裂、状态联动、击杀掉落、波次推进、boss phase 和撤离条件。
- 高频 steering、movement、projectile integration、contact collection 和 renderer sync 使用 system，不用 TCA/GAS 逐帧扫描。

基础能力集至少验证：

- `rifle.fire`：GAS 校验弹药/热量/冷却，app combat module 生成 server-owned projectile entity，Physics 命中后施加 damage effect。
- `dash`：GAS 校验 stamina、cooldown 和 blocked tag，movement/Physics 执行冲刺，客户端只做有限表现预测。
- `shock.field`：Physics overlap query 产生候选，玩法层校验阵营和范围，GAS 应用 damage + shocked duration effect。
- `turret.deploy`：Multiplayer action + Physics placement query + shared resource cost，生成同时具有 GAS actor、Physics body 和 RenderObject projection 的建筑 entity。
- `enemy.attack`：AI 选择目标，Physics/距离校验，GAS 激活攻击并应用效果。
- `status.reaction`：TCA 监听 GAS/physics 低频事实，在条件满足时触发额外 effect、cue 或 objective update。

GAS/TCA 的内部 runtime state、trace 和 handler 不复制到客户端。客户端只消费 authority 投影出的 attributes、tags、cooldowns、active effect summary、combat results 和 cue facts。客户端不得重新运行 TCA/GAS 来决定伤害或效果是否成立。

## Data 与 Asset 工作流

所有内容定义都从已物化 DataPack 进入 DataRegistry，不在 gameplay system 中维护平行常量表。

```txt
app content modules
  -> materialized DataPack[]
  -> DataType normalize / validate / references / indexes
  -> DataRegistry reference graph
  -> AssetManager registers asset.definition
  -> boot/match/combat/boss preload plans
  -> Phaser Driver asset loader and shared cache
  -> entity archetype materialization
```

Outpost app 自定义 DataType 可以描述 player archetype、enemy archetype、weapon、buildable、wave 和 objective，并通过 DataRef 组合：

- `gas.actor`、`gas.ability`、`gas.effect`、`gas.tag`、`gas.cue`
- `tca.rule`
- `physics.body`、`physics.collider`、`physics.material`
- `render.object`
- `asset.definition`

资源只能通过 AssetRef / asset id 进入 render、UI 或 cue presentation。Gameplay definition 不直接保存 URL，Renderer 不自行加载资源，Phaser asset loader 不读取 gameplay DataPack。

预载至少分为 `boot`、`match`、`combat` 和 `boss`。Boss 或可选视觉资源使用 lazy load；加载失败、重试、缺失引用和不支持 source 必须形成不同 diagnostics。Headless server 使用相同 DataPack 和引用校验，但不加载纯客户端视觉 payload。

## Multiplayer 与复制

高频 authority state 使用 app-owned、字段级 Colyseus Schema：

```txt
server World / GAS / objective state
  -> app-owned replication projection
  -> Colyseus Schema patch
  -> client authoritative shadow
  -> prediction / presentation tracks
  -> Renderer target and low-frequency UI view model
```

复制投影至少包含：

- entity identity、generation、archetype 和 lifecycle。
- transform、velocity、aim 和必要 physics presentation state。
- health/shield/resource、公开 tags、cooldown 与 active effect summary。
- player/participant、team、wave、objective、shared resource 和 match phase。
- 可去重的 cue/combat fact stream，例如 hit、death、ability rejected、teleport 和 boss phase change。

不复制 server-only AI state、TCA compiled rule、GAS internal maps、Physics backend handle、Save payload 或完整 DevTools trace。

Continuous movement/aim 使用 latest-per-source coalescing；ability/build/interact/ready 使用 bounded FIFO。客户端 prediction 只覆盖声明过的 movement/aim 和有限 dash presentation，不预测 damage、target selection、resource ownership、effect 或 objective result。

## Browser 表现、Input、Camera 与 UI

Browser 正式通过 configured App Host 组合 Platform、Phaser Driver、Data、Asset、Renderer、Input、Multiplayer、GameRuntime、UI、Save 和 DevTools。Camera、Physics presentation bridge、TCA/GAS client view bridge 和 Multiplayer presentation 仍通过 GameModule 安装。

- Input Router 统一键鼠、手柄、触控和 UI action；game、ui、modal、text-input、devtools scope 必须互斥正确。
- Camera 使用 follow、lookahead、zoom anchor、bounds 和 cue-driven shake；所有 screen/world/client/viewport 转换复用 Camera Core。
- Renderer 根据 entity lifecycle 创建/销毁 RenderObject，高频 transform 通过 presentation frame 批量写入，不经 EventBus 或 React。
- React UI 展示 lobby、HUD、ability/cooldown/effect、build menu、objective、results、reconnect 和 save/checkpoint 状态，只消费节流 snapshot/selector。
- GAS Cue 映射到 renderer command、camera shake、audio/particle presentation 或 UI toast；Cue 失败不能改变 gameplay 结果。

Phaser runtime 只能由 Driver 创建和持有。UI、gameplay domain 和 provider-neutral presentation 不读取 Phaser Scene、Colyseus Room、raw Schema 或 socket handle。

## Save 与 Platform

Outpost Siege 使用 Save contributor 验证完整 authority checkpoint，而不是保存连接状态：

- 保存 runtime seed/clock、可保存 World entity、identity mapping、Physics 可恢复状态、GAS actor/effect/cooldown、TCA once/runtime state、wave/objective/shared resource 和 app gameplay section。
- 不保存 Room、socket、peer connection、reconnect token、input queue、Schema collection、prediction buffer、RenderObject、UI focus 或 DevTools timeline。
- Restore 先准备 Data/Asset compatibility，再恢复 World identity，随后恢复 Physics、GAS/TCA 和 app gameplay，最后重新建立 participant binding 与复制 projection。
- 固定 seed 下 checkpoint restore 后继续 tick，必须与未中断 authority runtime 得到等价稳定 snapshot。

Web 正式路径使用 Platform Web storage 处理 client-local settings 或测试 slot；Tauri smoke 使用 Platform File SaveStore 验证权限、语义路径和原子写入；server/headless 测试使用 MemorySaveStore。多人 session 的生产持久化、账号云存档和跨进程数据库不在本 Demo 范围内。

## DevTools 与可解释性

DevTools 必须能关联一条完整战斗因果链：

```txt
input action
  -> multiplayer envelope / authority ingress
  -> GAS activation or rejection
  -> projectile/physics query/contact
  -> GAS effect / attribute / tag
  -> TCA condition/action
  -> World lifecycle
  -> replication projection / Schema update
  -> cue / renderer / camera / UI
  -> checkpoint dirty state or save diagnostic
```

关联使用显式 correlation id、entity id、actor id、ability/effect/rule id 和 network sequence。默认 trace、profiler、queue、snapshot 和 cue history 都必须有界。Server DevTools source 可以直接观察 authority runtime；客户端只读取允许公开的 provider/network 与 presentation summary，不通过网络传输完整 server trace。

## 参与者与 Session 生命周期

- Lobby explicit leave 立即释放 player 和 seat。
- Running explicit leave 清空输入并按玩法规则安全移除或冻结 actor。
- Transport disconnect 清空输入并进入有限 grace period；不默认引入 bot 接管。
- Provider reconnect 恢复同一 stable player binding，创建新 input epoch，不重放旧 action。
- Running late join 进入 spectator/next-round。
- Leader disconnect 只转移权限，不改变 authority runtime。
- Room close、idle timeout 或 server shutdown 统一释放 runtime、physics scene、GAS/TCA state、listener、timer、queue、Schema collection 和 DevTools buffer。

Explicit leave、disconnect、reconnect、page refresh、new join、checkpoint restore 和 room recreate 是不同事实，UI 和测试不能只从 peer count 推断结果。

## 性能与负载

常规 profile 目标为 4 active players、250 enemies、300 projectiles、64 buildables 和 128 pickups。压力 profile 可以提升到 1,000 enemies、1,500 projectiles、256 buildables 和 512 pickups。

必须分别测量：

- Server authority tick 中 ingress、AI、Physics、combat、TCA/GAS、lifecycle、replication 和 Schema commit。
- Browser input/prediction/presentation、render sync、UI refresh 和 DevTools overhead。
- Data registration、Asset preload、Save capture/restore 和 App Host lifecycle waterfall。
- Stable identity registry 的注册、反向查询、entity churn 和 retained size；查询必须使用索引而不是扫描全部 entity mapping。
- 单房、多房、reconnect churn、entity churn 和 60-minute soak 的 heap、GC、event-loop lag 与资源释放。

所有性能预算来自可复现基线。常规 PR 只保留确定性正确性门禁；粗粒度 budget、浏览器负载和 soak 进入手动或定时 workflow。

## 约束与非目标

- 不把 Outpost gameplay、Schema、AI、combat、wave 或 objective 上推为 GameKit core API。
- 不在 Demo 内复制 TCA、GAS、Save、Asset、Input、Camera、Physics 或 Multiplayer runtime。
- 不让 client、UI、Renderer、Cue 或 DevTools 决定 authority gameplay 结果。
- 不把 backend native object 写入 World、Data、Save、replication 或可复用 GameModule API。
- 不为 Demo 自研 ECS、物理引擎、网络 server、通用 rollback、AOI framework、Content Package System、账号、云存档或生产 matchmaking。
- 不要求一个 2D Demo 重复验证所有 3D/backend adapter；专属 adapter 继续由 conformance test 和 Lab 验证。
- 不为了覆盖率制造没有真实玩法用途的模块调用；每项能力必须进入真实生命周期、因果链或用户体验。
