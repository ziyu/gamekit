# Outpost Siege Comprehensive Demo

Status: Active. Wave 0 and Wave 1 were verified on 2026-07-11; scope was expanded and replanned on 2026-07-12.

## Goal

实现独立应用 `apps/multiplayer-outpost-siege-demo`，通过一个完整、物理化、数据驱动、server-authoritative 的多人合作游戏验证 GameKit 当前所有核心能力能否在同一条真实产品链路中协同工作。

长期应用体验和模块协作以 `docs/apps/multiplayer-outpost-siege-demo.md` 为准。本文件只维护实施范围、基础缺口、波次、决策门和验证证据。

## Scope Revision

2026-07-12 将目标从“复杂 Multiplayer 专项验证”扩展为“全框架综合验证”。Multiplayer 仍是关键约束，但完整验收还必须覆盖：

- Core Runtime、EventBus、GameModule lifecycle 和固定 system order。
- App Host、Config、Browser/Headless/Tauri profiles 和 Driver lifecycle。
- DataPack、DataRegistry、AssetRef、AssetManager preload/lazy/retry 完整内容资源链。
- World entity、Physics、TCA、GAS 组成的权威战斗系统。
- Input、Camera、Renderer、React UI 和 Cue presentation。
- Save contributor、checkpoint、migration 和 deterministic continuation。
- DevTools correlation、inspector、profiler 和 bounded diagnostics。
- 真实 Colyseus Room-owned authority、字段级 Schema、participant lifecycle、负载与 soak。

此次范围扩展不废弃已经完成的 Wave 0/1。它们是新的综合 Demo 所需的 Multiplayer/Physics foundation，并已提交为 `0ab9c2a`。

## Long-term References

- `docs/project-design.md`
- `docs/architecture.md`
- `docs/apps/multiplayer-outpost-siege-demo.md`
- `docs/modules/app-host.md`
- `docs/modules/core-runtime.md`
- `docs/modules/data.md`
- `docs/modules/assets.md`
- `docs/modules/world.md`
- `docs/modules/input.md`
- `docs/modules/camera.md`
- `docs/modules/physics.md`
- `docs/modules/tca.md`
- `docs/modules/gas.md`
- `docs/modules/multiplayer.md`
- `docs/modules/renderer.md`
- `docs/modules/ui.md`
- `docs/modules/save.md`
- `docs/modules/platform.md`
- `docs/modules/devtools.md`
- `docs/adr/0016-room-owned-server-authority-lifecycle.md`
- `docs/adr/0017-app-owned-colyseus-field-schema-boundary.md`
- `docs/adr/0018-server-authoritative-gameplay-module-execution.md`

## Verified Baseline

Wave 1 commit：`0ab9c2a Build multiplayer authority foundation`。

已验证基础：

- Multiplayer authority loop 支持受约束 `beginTick()` / `commitTick()`，并保留兼容 `tick()`。
- Authority action/input 与 standard Multiplayer GameModule command queue 使用有界 ring queue。
- Queue capacity、per-tick consumption、overflow、expired、coalesced 和 diagnostics 有测试。
- Physics GameModule 维护 body/collider → entity 反向索引，并清理 despawn/disabled stale handles。
- `@gamekit/multiplayer-core` 43 tests、`apps/multiplayer-demo` 59 tests、`@gamekit/physics-core` 8 tests 通过。
- Multiplayer benchmark 12/12 budgets 通过；Physics 3,000 entity profile 约 4.43 ms/tick。
- 全仓库 test、build、lint、format 和 world benchmark 通过。

Relay Arena 继续承担最小 Multiplayer regression。Outpost Siege 不修改其职责。

## Current Framework Gaps

代码核对后，综合 Demo 开始前需要先补齐以下真实缺口，不能在 app 内旁路实现：

### GAS Runtime

- 现有 GAS 已支持 entity-backed actor、attribute/tag、ability、cost、cooldown、effect、periodic update、cue 和 trace。
- 需要补 actor remove/despawn cleanup，防止 World entity 销毁后 runtime mapping 和 effect state 泄漏。
- 需要明确并实现可验证的 effect stacking/refresh/replace policy；不能让同类 duration effect 无限制增长。
- Ability/effect/attribute/cue trace 需要携带稳定 correlation context，连接 network action、Physics hit、TCA rule 和 presentation cue。
- Gameplay module 需要稳定、可注入的 GAS runtime access boundary；不能长期靠 app closure 捕获 standard module 的内部 runtime。
- 需要标准 GAS Save contributor，恢复 attributes、tags、cooldowns 和 active effects，并处理 entity remap。

### TCA Runtime

- TCA 已支持 rule compile、event index、condition/action、priority、once 和 trace。
- TCA trace 需要 correlation/parent context，连接触发 event 与派生 GAS/World/Cue fact。
- Once/runtime-local state 需要标准 Save contributor；restore 不能重新执行已经完成的 once rule。
- Outpost app definitions 必须通过稳定 handler context/bridge 使用 World、PhysicsQueries 和 GAS，不得 import app/server/backend private objects。

### Physics / World / Save

- 需要 app-owned、显式可保存 component definitions 和 stable gameplay id ↔ EntityId remap。
- Physics Save contributor 需要保存可恢复状态并在 World restore 后重建 scene；不能保存 Rapier handle/cache。
- Contact 到 semantic hit candidate 的转换属于 app combat module；Physics core 不加入 damage/team/projectile 语义。

### App Host / DevTools Composition

- 需要证明 standard camera、physics、TCA、GAS、multiplayer modules 与 app modules 能按权威 pipeline 顺序安装和释放。
- TCA/GAS/Physics/Multiplayer trace source 需要进入同一个 DevTools correlation timeline，并保持默认低开销、有界。
- Headless Room、Browser client 和 Tauri client profile 必须共享 app definition/content contract，但提供不同 adapter 和 service 参数。

### Colyseus Server Boundary

- `@gamekit/multiplayer-colyseus/server` 需要不包含 app gameplay/Schema 的 typed Room-side runtime bridge。
- App-owned Schema projection、participant policy、AI、combat、TCA/GAS 和 Save checkpoint 保持在 Outpost app。

## Architecture Decisions

### Authority

- 在线正式结果只由 Room-owned authority GameRuntime 决定。
- Server 运行 World、Physics、AI、TCA、GAS、objective、spawn/despawn 和 checkpoint capture。
- Client 不运行决定正式 damage/effect/objective 的 TCA/GAS，只维护 authority shadow、prediction、presentation 和 UI view model。
- Local authority/headless fixture 使用相同 gameplay modules，不维护第二套 reducer。

### System Order

```txt
authority begin / ingress
  -> participant and input intent
  -> movement and AI
  -> Physics sync / fixed step
  -> contact and query facts
  -> combat / GAS
  -> TCA / objective / lifecycle
  -> checkpoint dirty state
  -> replication projection
  -> authority commit / provider publish
  -> diagnostics
```

GameRuntime 继续使用注册顺序，不新增全局 phase catalog。Outpost composition tests 固定 app-specific order。

### Combat Boundary

- Entity 是战斗对象的 runtime 载体。
- Physics 负责空间与运动；World/app components 保存 intent、team、projectile、lifetime 和 identity。
- GAS 负责 ability/effect/attribute/tag/cost/cooldown/cue。
- TCA 负责状态反应、击杀链、波次、目标、掉落和 boss phase 等低频规则。
- EventBus 只发送 ability activated、hit confirmed、actor died、wave completed 等低频事实。
- Renderer/UI/Cue 只表现结果，不决定 gameplay。

### Data And Asset Boundary

- 所有 archetype、ability、effect、rule、physics、render 和 asset 定义进入 DataRegistry。
- App content 文件可以按 player/enemy/building/wave 业务概念组织，一个文件可混合多个 DataType entry。
- AssetManager 从 `asset.definition` 建立 boot/match/combat/boss load plan。
- Gameplay 和 RenderObject 只保存 AssetRef/asset id；不直接保存 URL 或 native texture。
- Headless server 注册相同定义和引用，但跳过纯视觉资源加载。

### Save Boundary

- 保存 authority gameplay checkpoint，不保存网络连接或 client presentation。
- Restore order：Data/Asset compatibility → World identity/entity → Physics → GAS/TCA → app gameplay → replication rebuild。
- Restore 后 participant/session 重新绑定；旧 input epoch、queue、Schema collection 和 prediction history 不恢复。

## Implementation Waves

### Wave 0: Workflow Baseline And Decisions

Status: Verified on 2026-07-11.

已完成：Relay Arena baseline、Room-owned authority ADR、app-owned field Schema ADR、authority system order、Physics profile 和性能 profile 规划。

### Wave 1: Multiplayer And Physics Foundation

Status: Verified on 2026-07-11; commit `0ab9c2a`.

已完成：staged authority tick、bounded queues、queue diagnostics、Physics reverse index/cleanup、tests 和 benchmark。

### Wave 2: Gameplay Framework Readiness

Status: In progress since 2026-07-12.

1. 为 GAS 增加 actor remove/cleanup、effect stack policy、correlation context 和稳定 runtime handle/bridge。
2. 为 TCA trace 增加 correlation/parent context，确保派生 event 继承因果信息。
3. 实现 GAS、TCA 和 Physics 的标准 Save contributor；World 可保存组件与 app entity mapping 使用既有 Save contributor 协议组合。
4. 用 App Host standard modules + app modules 固定 authority system order、runtime access 和 dispose order。
5. 为 TCA/GAS/Physics trace 与 DevTools source 增加 headless correlation fixture。
6. 更新对应模块长期文档、tests 和 microbenchmarks；公共 API 变化需要独立 ADR 或扩展 ADR 0018 后续决策。

完成标准：headless fixture 不依赖网络或 renderer，即可完成“ability request → Physics hit/query → GAS effect → TCA reaction → entity cleanup → save/restore continuation”的确定性链路，所有 runtime handle 和 trace buffer 可释放。

已验证切片：

- EventBus event envelope 支持 `correlationId` / `parentId`；TCA rule trace、内置派生 event 和 GAS TCA actions 继续传播因果链。
- GAS 支持显式 `removeActor`、entity despawn stale mapping cleanup、stable actor id rebind 和 module-bound `GasHandle`。
- Lifecycle effect 默认使用有界单栈刷新；显式 stacking 支持 limit、source match 和 reject/refresh/replace overflow policy。
- GAS tag 记录 grant source，effect expire/replace 不会移除其他来源仍提供的同名 tag。
- GAS ability/effect/attribute/tag/cue trace 与 EventBus fact 保留 correlation/parent；相关 runtime 已按 actor state、effect runtime、handle 和 operation context 拆分。
- 新增 gameplay framework microbenchmark 与 9 项粗粒度预算，覆盖 correlated EventBus fan-out、1,004-rule TCA indexed dispatch、GAS ability/effect chain、bounded stacking、500 entity actor idle/dormant/periodic tick 和 4,000 actor stale entity cleanup。
- GAS effect update 不再把 idle 或本 tick 未变化的 actor 写回 World；`periodMs` 必须严格大于零，避免 authority tick 进入不前进的 periodic loop。
- `@gamekit/event-bus` 4 tests、`@gamekit/tca` 8 tests、`@gamekit/gas` 14 tests、`@gamekit/app-host` 27 tests 和 Abyss Delve 17 tests 通过。
- 全仓库 `test`、`build`、`lint`、`format` 和 `bench:world` 通过；10,000 entities / 5,000 moving entities 的本次结果为 spawn/add 11.68 ms、query/update 6.95 ms。
- `bench:gameplay:check` 9/9 budgets 连续两次通过；本机代表结果为 TCA 1.56 µs/event、GAS combat chain 5.03 µs/activation、500 dormant effects 0.74 ms/tick、500 periodic effects 1.63 ms/tick、2,000 stale actor cleanup 5.25 ms。

剩余工作：TCA/GAS/Physics Save contributor、authority module/system order fixture，以及多模块 DevTools correlation source。

### Wave 3: App Skeleton And Content Pipeline

Status: Planned.

1. 创建 `apps/multiplayer-outpost-siege-demo`，拆分 `domain`、`content`、`gameplay`、`server`、`realtime`、`presentation`、`ui`、`profiles` 和 `test`。
2. 定义 app-owned player/enemy/weapon/buildable/wave/objective DataType 和引用校验。
3. 注册 GAS、TCA、Physics、Renderer、Asset 内置 DataType，并建立第一批业务 DataPack。
4. 建立 boot/match/combat/boss Asset groups，使用 AssetRef、Phaser Driver loader、lazy/retry 和 diagnostics。
5. 建立 stable gameplay object id、EntityId、actorId、physics id、network identity、RenderObjectId 映射。
6. 创建共享 app definition，以及 Browser Web、headless server、deterministic test 和 Tauri smoke profiles。

完成标准：所有内容通过 Data/Asset pipeline 启动；缺失引用、重复定义、资源加载失败能定位 source/path；headless server 不加载视觉 payload；没有 gameplay 常量表或直接 URL 旁路。

### Wave 4: Room-owned Multiplayer Vertical Slice

Status: Planned.

1. 在 Multiplayer Colyseus backend 增加通用 typed Room-side runtime bridge。
2. Room 持有 headless App Host、authority GameRuntime、Physics、TCA/GAS runtime 和统一 dispose lifecycle。
3. Browser 使用 configured App Host、Phaser Driver、Input、Camera、Renderer、UI、Multiplayer 和 DevTools。
4. 实现 lobby、ready、countdown、player entity spawn、四人 movement/aim 和 room close。
5. Continuous input 使用 latest-state；ready/start 使用 bounded action FIFO。
6. 建立 app-owned field-level player Schema、authority shadow、entity generation、initial sync 和 resync。

完成标准：关闭 party leader 浏览器后 Room 仍继续 authority tick；四个客户端读取同一 player entity state；不同 room 隔离；所有 Host/GameModule/backend lifecycle 可释放。

### Wave 5: Physical TCA/GAS Combat

Status: Planned.

1. 实现 player/enemy/projectile/buildable 的 entity archetype materializer。
2. 实现 movement intent、AI steering、Rapier 2D sync、hitbox/hurtbox、projectile、overlap/raycast 和 placement validation。
3. 实现 rifle、dash、shock field、turret deployment 和 enemy attack GAS abilities。
4. 实现 health/shield/stamina/resource attributes，damage/heal/knockback/status duration/periodic effects，以及 stack/refresh/expire。
5. 实现状态反应、kill/drop、shield break、boss phase 和 objective TCA rules。
6. 建立完整 correlation：network command → GAS → Physics → GAS effect → TCA → World lifecycle → cue。
7. 测试非法 source、cost/cooldown/tag/target/placement rejection 不改变 authority state。

完成标准：战斗结果只来自 authority runtime；所有战斗对象基于 World entity 和 Physics；TCA/GAS 定义来自 DataRegistry；客户端不能通过伪造 Schema、cue 或 UI command 改变 damage/effect。

### Wave 6: Replication, Prediction And Presentation

Status: Planned.

1. 扩展 app-owned Schema collections，覆盖 entity lifecycle、transform、actor public state、combat facts、wave/objective 和 shared resource。
2. 实现 stable `entityId + generation`、provider version、source/schema gate、spawn/despawn 和 resync。
3. 本地 movement/aim 使用 prediction/reconciliation；dash 只做有限 presentation prediction。
4. 远端 player/enemy/projectile 使用 core playback 和 declared `Network*` tracks。
5. Combat cue 使用有界、可去重 fact stream；teleport/respawn/generation/binding change reset history。
6. Renderer 批量消费 presented values；不在 Schema callback 中逐对象写 Phaser。

完成标准：Demo 上层没有平行 interpolation clock 或 deep snapshot clone；damage/effect/objective 不预测；本地响应及时，远端连续，reset 后不残留旧 track/cue。

### Wave 7: Camera, UI And Complete Session

Status: Planned.

1. Camera follow/lookahead/bounds/zoom anchor/shake 与 Phaser Driver camera adapter 接通。
2. Input scope 覆盖 game、ui、modal、text-input、devtools；键鼠、手柄和 UI action 走同一语义层。
3. React UI 完成 lobby、loadout、HUD、ability/effect、build menu、objective、reconnect、results 和 rematch。
4. 完成普通 wave、intermission、elite/boss、extraction、胜负和统计。
5. 完成 cue → renderer/camera/UI presentation，失败不阻塞 authority tick。
6. 覆盖 desktop 和 mobile-sized spectator/diagnostics layout、focus、reduced motion。

完成标准：四人可以从 lobby 完成一局；UI 不订阅每帧 World state；DevTools/modal/text input 不误触 gameplay；所有 camera 坐标转换使用 Camera Core。

### Wave 8: Save, Platform And Participant Lifecycle

Status: Planned.

1. Intermission 创建 authority checkpoint，覆盖 runtime、World、Physics、GAS、TCA、wave/objective/resource sections。
2. 固定 seed 验证 save → new runtime → restore → continue tick 与 uninterrupted runtime 等价。
3. 验证 format migration、missing content compatibility、corrupted payload 和 contributor failure diagnostics。
4. Web 使用 Platform storage；Tauri smoke 使用 Platform file store、语义路径、权限错误和原子写入；headless test 使用 memory store。
5. 完成 spectator/next-round、explicit leave、disconnect grace、provider reconnect、timeout、leader transfer、room recreate。
6. Restore 或 reconnect 不复用旧 queue、input epoch、Schema collection、prediction buffer 或 RenderObject。

完成标准：checkpoint 可恢复权威 gameplay 而不保存网络/native state；Web/Tauri/headless 使用相同 Save contract；完整 participant lifecycle matrix 通过真实 Colyseus integration。

### Wave 9: DevTools, Load And Soak

Status: Planned.

1. 标准和 app-specific sources 覆盖 Host、Data、Asset、World、Input、Camera、Physics、TCA、GAS、Multiplayer、Renderer、UI 和 Save。
2. Timeline 展示完整 combat correlation；Inspector 可从 entity 反查 actor、physics、data、asset、network 和 render identity。
3. Profiler 分离 ingress、AI、Physics、combat、TCA/GAS、lifecycle、replication、Schema、render、UI、asset 和 save 成本。
4. 建立 functional、single-room stress、multi-room throughput、browser frame、Tauri smoke 和 60-minute soak harness。
5. 运行 reconnect、spawn/despawn、save/restore、wave reset 和 room recreate churn；验证 heap、listener、timer、track、queue、registry 回到基线。
6. 只有字段级全量同步数据证明预算不足时，才实现 app-specific AOI/interest management。

完成标准：所有核心模块在同一应用有 inspectable evidence；所有 buffer/queue/history/registry 有界；性能退化能定位到具体阶段；soak 后 retained heap 进入平台期。

### Wave 10: Framework Extraction And Closure

Status: Planned.

1. 审查 Demo 中形成第二个稳定场景的 runtime handle、Save contributor、correlation、Schema mapping 或 diagnostics primitive。
2. 只下沉经过真实使用和压力验证的通用能力，app gameplay 与 Schema 保持本地。
3. 更新长期模块文档、最佳实践、ADR、package README、benchmark budget 和 release changeset。
4. 完成全仓库 test/build/lint/format、browser E2E、Tauri smoke、benchmarks 和 soak 证据。
5. 标记本工作流 Closed，记录最终提交/PR，并迁移仍有价值的结论。

完成标准：Outpost Siege 不维护平行 GameKit；核心 API 有测试、文档和真实 app 消费；所有完成门禁有可重复证据。

## Test Matrix

### Domain / Deterministic

- 同一 input/action log 在 local authority 和 Room authority fixture 得到等价稳定 snapshot。
- Ability cost/cooldown/tag、effect stack/expire/periodic、TCA condition/action/once 和 entity cleanup。
- Physics contact/query → semantic hit → GAS/TCA chain 不依赖 renderer、socket 或 wall clock。
- Save/load/tick continuation 和 entity remap。

### Content / Resource

- Duplicate、unknown type、missing DataRef/AssetRef、schema/path、override priority。
- Preload group、lazy load、retry、unsupported source 和 driver cache lifecycle。
- Headless profile 不加载纯视觉资源，但仍验证引用与 compatibility。

### Real Colyseus

- 1/2/4 clients 完成 session；late join、spectator、leave、disconnect、reconnect、room recreate。
- 非 authority client 不能写 gameplay/Schema state。
- 不同 room state、World、GAS/TCA、Physics 和 Save checkpoint 完全隔离。
- Provider commit/ack 只发生在完整 authority tick 后。

### Browser / Tauri

- App Host/Driver/Input/Camera/Renderer/UI/DevTools 生命周期。
- Prediction/presentation、focus scope、responsive/reduced motion。
- Web asset/save path 和 Tauri file/permission smoke。

### Performance / Soak

- Core microbenchmarks：World、Physics、Multiplayer、TCA/GAS hot paths、Save capture/restore。
- Functional：4 browser clients，250 enemies，300 projectiles，64 buildables，128 pickups。
- Stress：4 active headless clients + 12 spectators，1,000 enemies，1,500 projectiles，256 buildables，512 pickups。
- Multi-room：8 rooms × 4 bot clients，记录 tick fairness、event-loop lag、bandwidth 和 heap。
- Soak：60 minutes，重复 participant、entity、checkpoint 和 room churn。

## Completion Gate

只有同时满足以下条件，才能称为综合验证完成：

- 应用设计验证合同中的每个核心能力都有真实承载点和自动化证据。
- 四人可以完成完整 session，Room authority 不依赖任何 browser 存活。
- 战斗完全基于 World entity + Physics + GAS + TCA，且结果只由 authority runtime 决定。
- 内容、资源、物理、渲染、能力、效果和规则定义全部经过 Data/Asset workflow，没有 app-local 平行 registry 或直接 URL。
- Browser 正式走 App Host + Phaser Driver + standard services/GameModules；headless 与 Tauri profile 复用同一 app contract。
- 高频状态使用 app-owned field-level Schema，client prediction/presentation 不回写 authority state。
- Authority checkpoint 能恢复 World/Physics/GAS/TCA/gameplay 并继续确定性 tick，不保存 connection/native/presentation state。
- DevTools 能关联 input → network → Physics → GAS/TCA → World → replication → presentation → save。
- 所有 queue、buffer、trace、track、listener、timer、entity/actor/physics/render registry 有界且可释放。
- Functional、integration、browser、Tauri、benchmark 和 soak 证据可重复。
- 可复用结论已迁移到长期文档，工作流状态 Closed。

## Decision Gates

- AOI：只有全量 field-level Schema 实测超出 budget 才实现，先保持 app-specific。
- Projectile replication：先逐实体复制；只有 bytes/patch/presentation 数据不足时再评估事件化或分层。
- GAS/TCA extraction：只有通用 runtime 缺口进入 package；weapon、damage formula、status reaction 和 wave rule 保持 app-local。
- Save persistence：本 Demo 验证 checkpoint contract，不扩展账号、云同步或生产数据库。
- Backend breadth：Outpost 使用 Phaser + Rapier 2D + Colyseus + Web/Tauri；其他 driver/backend 继续通过 Lab/conformance，不在此复制覆盖。
