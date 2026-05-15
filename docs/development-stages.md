# 阶段路线图

本文档只负责阶段规划、当前状态、完成定义和阶段间依赖关系。长期项目定位放 `project-design.md`，包边界和依赖方向放 `architecture.md`，模块长期设计放 `docs/modules/`，不要在这里重复维护。

## 阶段映射

当前仓库已经完成原始设计文档中的这些基础切片：

- 项目基础：pnpm workspace、Turbo、TypeScript、Vite、Vitest、oxlint、oxfmt。
- Core + World Adapter：`core`、`world`、`world-koota`。
- EventBus + GameRuntime：低频事件和 runtime lifecycle。
- Renderer Core + Phaser Adapter：已修正为通用 render object protocol。
- 已实现基础切片已按长期模块设计重新对齐：renderer-core 不依赖 EventBus，renderer 诊断改为通用 callback，Sandbox 只在 app boot 层接入 Phaser adapter。

新文档新增或强化了 Platform、Input、Camera 三个基础模块。由于当前仓库已经先实现 Runtime/Renderer，后续需要先回补这三个基础层，再进入 Asset/Data、TCA、GAS、UI、Save、DevTools 和 Hero Road。

## Phase 1：Runtime 垂直切片

目标：证明 monorepo、薄内核、world facade、Koota adapter、EventBus、GameRuntime、Sandbox 可以协同工作。

当前状态：已实现。

已实现：

- pnpm workspace、Turbo、TypeScript、Vite、Vitest、oxlint、oxfmt。
- `@gamekit/core`
- `@gamekit/world`
- `@gamekit/world-koota`
- `@gamekit/event-bus`
- `@gamekit/game-runtime`
- `@gamekit/test-utils`
- `apps/sandbox`
- 已检查 Runtime 不直接拥有 renderer/input/camera/platform。
- 已检查 Sandbox game module 不直接依赖 Phaser。

完成定义：

- `corepack pnpm test` 通过。
- `corepack pnpm build` 通过。
- `corepack pnpm lint` 通过。
- `corepack pnpm format` 通过。
- Sandbox 页面能看到 runtime tick、实体状态和事件日志。

## Phase 2：Renderer Core + Phaser Adapter

目标：Phaser 能作为 2D 渲染后端接入，但 gameplay 和 runtime 只依赖 RendererAdapter。

当前状态：已实现。

已实现：

- `@gamekit/renderer-core`
- `@gamekit/renderer-phaser`
- renderer conformance helper
- sandbox render sync module
- app-owned renderer lifecycle ADR
- general render object / input decoupling ADR
- RenderObject / RenderNode / RenderCommand 长期协议
- renderer diagnostics callback，不让 renderer-core 依赖 EventBus

完成定义：

- Sandbox 中实体由 Phaser adapter 渲染并随 runtime tick 移动。
- 业务代码和 game module 不直接 import `phaser`。
- renderer-core 不包含 gameplay input event。
- renderer-core 不依赖 EventBus。
- renderer adapter lifecycle、object create/update/destroy、capability/unsupported type 有测试覆盖。
- renderer object tree、node update、command、diagnostic callback 有契约测试覆盖。

## Phase 3：Platform Core + Web/Tauri Adapter

目标：把文件、路径、窗口、权限、存储、dialog、clipboard、shell 等平台能力从业务层隔离出来。

模块设计：`docs/modules/platform.md`

当前状态：已实现。

已实现：

- `@gamekit/platform-core`
- `@gamekit/platform-web`
- `@gamekit/platform-tauri`
- Tauri capabilities 最小权限样例
- platform conformance helper
- Sandbox Web Platform 状态展示

完成定义：

- PlatformRuntime 不依赖 Tauri 或浏览器私有类型。
- Web/Tauri adapter 能提供基础 storage/fs/window/dialog 能力。
- Save/Asset 后续可以通过 Platform 读写，不直接依赖 localStorage 或 Tauri FS。
- 文档明确 appData/appConfig/appCache/resource 等路径策略。

## Phase 4：Input Core

目标：统一输入系统，把 raw input 映射成 input action / command，不让 renderer 或 React 直接拥有 gameplay input。

模块设计：`docs/modules/input.md`

当前状态：已实现。

已实现：

- `@gamekit/input-core`
- `@gamekit/input-dom`
- `@gamekit/input-phaser`
- InputAction / InputBinding / InputContext / InputRouter
- Input scope 过滤，支持 action/context 按 `game`、`ui` 等输入域生效
- DOM input adapter
- Phaser input adapter fake-driver contract
- Sandbox Input 状态展示、game viewport scope gate 和低频 `input.action` 事件桥接

完成定义：

- input-core 不依赖 DOM、Phaser、Tauri。
- Sandbox 能观察 input action，并能限制 gameplay/camera action 只在 game viewport 生效。
- Renderer 不重新引入 `onInput`。
- EventBus 只接收低频输入事实或 gameplay command，不接收高频 raw event。
- binding、scope、context 优先级、adapter normalization 有测试覆盖。

## Phase 5：Camera Core

目标：统一 2D camera 控制，为后续地图、编辑器、Cue 和 Renderer adapter 打基础。

模块设计：`docs/modules/camera.md`

当前状态：已实现。

已实现：

- `@gamekit/camera-core`
- `@gamekit/camera-phaser`
- CameraState2D
- CameraController
- Phaser camera adapter fake-driver contract
- Sandbox input action 驱动 camera pan/zoom
- Sandbox camera action 受 game scope 保护，非 game viewport 不响应
- Sandbox Camera 状态展示

完成定义：

- CameraController 不依赖 Phaser。
- Phaser adapter 能应用 CameraState2D。
- Input action 可以驱动 pan/zoom/follow。
- Renderer/camera 坐标转换有最小测试覆盖。
- 本阶段暂不实现 3D camera 和复杂 cinematic rig。

## Phase 6：Data Core

目标：先建立全局可扩展数据模块，让游戏中的所有可数据化定义都能通过统一 DataType / DataPack / DataRegistry 管理、校验、查询和追踪来源。

模块设计：`docs/modules/data.md`

当前状态：已实现。

预期新增：

- `@gamekit/data`
- DataType registration
- DataRegistry
- DataPack registration
- Data reference graph
- Data validation tests
- Sandbox Data panel

完成定义：

- `@gamekit/data` 不依赖 renderer、asset、TCA、GAS、UI 或具体游戏业务。
- 模块可以注册自定义 DataType，并提供 validate / normalize / references / index 扩展点。
- DataPack 可以注册多种 type 的数据，并保留 source pack、namespace、priority 等来源信息。
- DataRegistry 支持 get/list/query/snapshot 和 duplicate id 校验。
- Reference graph 能报告缺失引用，并能反查某个 definition 被谁引用。
- Sandbox 或测试夹具能注册至少 `asset.definition`、`render.object`、`gas.actor` 和用户自定义 type，证明 Data 不限制游戏内容模型。
- Sandbox UI 能展示 DataPack、DataType、document 和 reference 的基本状态。
- Sandbox DataPack 包含 actor、ability、biome、spawnProfile、renderRig 和用户自定义内容类型等较复杂示例数据，用于验证多 type、嵌套结构、索引、引用图和运行时消费路径。

## Phase 7：Asset System

目标：在 Data Core 之上实现资源声明和运行时加载。AssetDefinition 作为数据被 DataRegistry 管理，AssetManager 负责运行时加载状态，adapter 负责接入 Phaser 等后端。

模块设计：`docs/modules/assets.md`

当前状态：已实现。

预期新增：

- `@gamekit/asset`
- `@gamekit/asset-phaser`
- Asset DataType registration
- AssetManager
- Phaser asset adapter fake-driver contract
- Sandbox DataPack asset preload
- Sandbox Assets panel

完成定义：

- `@gamekit/asset` 依赖 `@gamekit/data`，但不依赖 Phaser、DOM、Tauri 或 renderer 具体实现。
- Sandbox 可以通过 DataPack 声明并加载至少一个 image/spritesheet asset。
- AssetManager 可以从 DataRegistry 读取 asset definitions，并跟踪 registered/loading/loaded/failed 状态。
- renderer-phaser 从 AssetManager/asset adapter 获取资源，而不是硬编码 URL。
- Asset 校验能报告缺失 assetId、重复 id、未知资源类型、运行环境不支持的 source。
- Sandbox UI 能展示 asset registered/loaded/failed 状态，资源加载事件进入 EventBus。
- Sandbox 通过多个 tintable image asset 驱动复合 RenderObject，验证 asset definition、Phaser 加载和 render props 的端到端链路。

## Phase 8：App Host

目标：建立统一应用组合层，让 Platform、Data、Asset、Renderer、Input、GameRuntime、UI 和 DevTools 能通过 service registry、统一 lifecycle、配置和 diagnostics 协同启动，并让 Camera/TCA 这类游戏会话能力通过标准 GameModule helper 注入 GameRuntime，而不是散落在 app 入口文件中。

模块设计：`docs/modules/app-host.md`

决策记录：`docs/adr/0004-app-host-composition-layer.md`

边界决策：`docs/adr/0005-app-service-vs-game-module-boundary.md`

当前状态：已实现。

边界备注：

- Camera 不作为 App Host 标准服务；camera controller / action bridge 通过标准 GameModule helper 注入 GameRuntime。
- App Host 可以提供 renderer/input/data 等依赖和标准模块装配入口，但不把 gameplay runtime 暴露成 `services.camera` 这类 app service。

已实现：

- `@gamekit/app-host` 首版
- AppServiceRegistry
- AppServiceBinding
- 内置标准服务定义表，负责把 profile 参数转换成统一 Service Binding
- App service lifecycle coordinator
- App config runtime
- GameAppDefinition / AppProfile adapter params
- `createConfiguredAppHost` 声明式装配入口
- `createStandardAppProfile` 标准 profile 参数 helper，避免 app profile 手写内置 service lifecycle
- Host diagnostics / snapshot
- Headless host fixture
- Sandbox 通过 App Host 管理 Platform、Data、Asset、Renderer、Input、GameRuntime 生命周期，并通过标准游戏模块注入 Camera/TCA
- Sandbox 迁移到 App Host definition + web profile，入口只保留 UI mount、boot/start 和状态刷新

完成定义：

- GameRuntime 不直接拥有 renderer、input、camera、platform、asset、data。
- Host 可以按依赖顺序 `boot/start/stop/dispose` services，并按反向顺序释放。
- Platform、Data、Asset、Renderer、Input、GameRuntime 等内置服务也通过统一 binding 进入 lifecycle，不在 Host 内部特殊分支处理；Camera/TCA 通过 GameModule lifecycle 清理。
- Host services 支持 `services.data`、`services.assets`、`services.renderer` 等标准入口，也支持扩展 service key。
- Host config 能合并 framework default、app config、platform profile、user settings 和 test override，并能解释最终值来源。
- Host diagnostics 能展示 service phase、失败 service、错误 code、配置来源和 adapter 状态。
- Sandbox 入口不再手写主要初始化流水线，而是声明 app definition / profile / modules / datapacks。
- Headless Host 可以在测试中组合 memory renderer、fake asset loader、memory platform 和 deterministic clock。

## Phase 9：TCA 规则系统

目标：Trigger / Condition / Action 数据驱动规则系统跑通，并从第一版开始可追踪。

模块设计：`docs/modules/tca.md`

边界决策：`docs/adr/0005-app-service-vs-game-module-boundary.md`

当前状态：已实现。

已实现：

- `@gamekit/tca`
- GameModule install cleanup / GameRuntime dispose
- `createTcaModule(...)` 标准模块入口
- App Host `game.standardModules.tca` / `game.standardModules.camera`
- App Host `game.createRuntime(ctx, modules)` 标准模块注入
- TCA rule DataType
- event.type trigger indexing
- trigger/condition/action definition registry
- event.emit built-in action
- TCA trace store
- Sandbox 自定义 TCA trigger/condition/action definitions
- Sandbox 复杂 `tca.rule` DataPack 示例
- Sandbox TCA trace panel
- Rule/runtime/module tests

完成定义：

- GameModule 可以返回 cleanup/disposable，GameRuntime dispose 按反序清理模块订阅。
- EventBus event 能触发 TCA rule。
- trigger/condition/action definition 可由外部模块注册。
- trace 能回答“哪个事件触发了哪些规则、哪些 condition 失败、执行了哪些 action”。
- TCA 不用于每帧高频逻辑；规则按 event type 索引并预编译。
- TCA 不作为 App Host 标准服务；普通游戏通过 `createTcaModule` 或 App Host 标准游戏模块无痛安装。
- Camera runtime 行为通过 App Host 标准游戏模块注入 GameRuntime，不继续扩大 App Host 的 gameplay service 范围。

## Phase 10：GAS

目标：实现通用 GAS Core + ECS-backed Actor Runtime。Actor、Attribute、Tag、Ability、Effect、Cue、Clue 基于 Data/TCA 跑通，同时让常见 actor 运行时热状态落在 World component 上，充分利用 ECS 性能。

模块设计：`docs/modules/gas.md`

当前状态：已实现。

已实现：

- `@gamekit/gas`
- GAS DataType registration
- GasActor/GasAttributes/GasTags/GasAbilities/GasEffects ECS components
- entity-backed actor runtime
- detached actor runtime
- GAS TCA definitions
- App Host `game.standardModules.gas`
- Actor/Ability/Effect definition tests
- Ability / Effect lifecycle tests
- Sandbox GAS panel
- Sandbox scene workbench：主舞台、选中 actor inspector、跨模块 timeline
- Sandbox DataPack actor/ability/effect/cue 示例
- Sandbox TCA → GAS ability → effect 链路

完成定义：

- `@gamekit/gas` 是 GameModule，不是 App Host service。
- GAS 只依赖 `@gamekit/world` facade，不依赖 Koota。
- 常见 actor runtime state 存在 World components 上。
- Basic Attack Ability 能通过 event/TCA 激活并修改目标状态。
- Active effect 可以按 runtime tick 更新 duration/periodic action，并能到期清理 tag。
- GAS trace 能关联 ability/effect 与 TCA rule trace。
- 示例 actor 数据通过 DataPack 注册和校验。
- Sandbox 展示 input/event → TCA → GAS ability → effect → state/cue/trace 链路。

## Phase 10.5：Sandbox Signal Outpost

目标：把 Sandbox 主场景升级为 `Signal Outpost` 自动放置 demo，让模块协作主要发生并表现于主舞台，而不是只堆在 Inspector 和 Timeline 中。Sandbox 要像一个可运行的小型系统 demo，而不是一张由实体点和面板组成的架构示意图。

设计文档：`docs/apps/sandbox.md`

当前状态：Phase 10.5A 已实现；Phase 10.5B / 10.5C 待实现。已有 outpost 系统舞台和调度循环，但压力层、玩家策略操作、成长层和表现打磨仍未完成，不能视为整个 Phase 10.5 完成。

已有原型基线：

- Signal Outpost 主舞台对象：Command Core、Relay Tower、Scout、Data Node、Asset Fabricator、Interference Node、Signal Link。
- Sandbox DataPack 扩展 sceneObject / sceneLayout，并通过引用图关联 renderObject、renderRig 和 GAS actor definition。
- Sandbox-local world components：SceneObject、Selectable、SignalStorage、ProductionState、WorkAssignment、ThreatState、LinkState。
- 自动放置循环：signal production、scout transport、interference strike、objective progress。
- 主舞台复合 RenderObject：不同角色独立视觉结构，link beam、charge bar、cargo/task/threat field 由 runtime state 驱动。
- Snapshot / Inspector / Timeline 展示 Outpost 对象、signal storage、GAS state 和跨模块链路。

下一步拆分为三个连续版本，避免继续在单个原型上堆功能。

### Phase 10.5A：系统舞台与调度循环

目标：让主舞台从“对象陈列”变成可读的 outpost 运行系统。

当前状态：已实现。

已实现：

- Sandbox DataPack 新增 station、productionRecipe、objectivePhase、threatProfile、outpostRoute。
- sceneObject 引用 station definition 和 production recipe，sceneLayout link 引用 route definition。
- ECS 状态新增 StationState、ObjectiveState，并扩展 Scout WorkAssignment 的 battery、fatigue、source、route progress。
- Scout dispatcher 按 repair、suppress、support、collect、deliver 需求生成任务。
- Command Core objective state 消耗 delivered signal 推进 phase progress。
- Station heat、stability、priority、throughput 和 Scout route/battery/fatigue 进入 snapshot 和 renderer node sync。
- 主舞台点击对象可切换 Inspector 选中对象，Inspector 可请求标准 camera module 跟随或释放选中 entity。
- Sandbox 将 game viewport pointer 输入归一化为 renderer-local 坐标，camera zoom 以操作点为 anchor。

任务拆分：

1. 场景数据重构
   - 扩展 Sandbox DataPack：station、objective、production recipe、threat profile、render rig、scene layout。
   - 定义 Command Core、Relay Tower、Scout、Data Node、Asset Fabricator、Interference Node、Signal Link。
   - 确保新数据仍通过 DataRegistry 注册、校验、引用追踪，不绕过 DataPack。

2. World 组件和场景模型
   - 新增 sandbox-local components：SceneRole、Selectable、ProductionState、SignalStorage、WorkAssignment、ThreatState、LinkState。
   - 让主场景对象都能关联 entity、data definition、render object 和可选 GAS actor。
   - 保持这些组件只在 `apps/sandbox` 内部，不上推到核心包。

3. 自动放置循环
   - 实现 signal production system：Relay Tower 周期产出 signal。
   - 实现 scout dispatcher：按 station priority 和当前需求自动生成 collect / deliver / repair / suppress / scan 任务。
   - 实现 scout work system：Scout 拥有 cargo、battery、fatigue、route progress、current order，并在舞台上显示路线。
   - 实现 objective system：Command Core 消耗 signal 推进 objective phase，并产生 milestone event。

4. 主舞台结构
   - 固定空间语义：中央 Command Core、左上 Signal Field、右上 Fabrication Bay、左下 Archive Wing、右下 Interference Rift。
   - Signal Link 和 scout route 必须可见，能看出 signal、任务和资源流向。
   - 第一屏不依赖 Inspector 也能看出 outpost 在生产、运输和推进 objective。

完成定义：

- 无输入时，场景能持续生产、运输、消耗 signal 并推进 objective。
- Scout 有清晰任务状态、目标和路线，不只是随机移动实体。
- DataPack 中 station、recipe、objective、route/link 能被 DataRegistry 查询并出现在 reference graph。
- 主舞台空间结构、对象角色和资源流向清晰可见。

### Phase 10.5B：压力、规则与能力链路

目标：让 TCA/GAS 成为场景里的自动化和状态变化机制，而不是面板中的 trace 样例。

任务拆分：

1. 压力层
   - 实现 Interference Node 的 pressure cycle：signal storm、data corruption、tower overload、scout jammed、core instability。
   - pressure 影响 station stability、link flow、scout work efficiency 或 objective progress。
   - 威胁范围、预警、污染、断连和修复状态必须在舞台上表现。

2. TCA / GAS 链路增强
   - 扩展 Sandbox TCA rules：confirm overcharge、low stability repair、interference response、objective milestone。
   - 扩展 GAS 数据：station actor、signal_strike、overcharge_relay、field_repair、stabilize_core、interference mark、repair over time。
   - Timeline 必须能看到 input → TCA → GAS → effect/cue → scene feedback。

3. 玩家操作
   - 支持选择 station、scout、threat 和 link。
   - `confirm` 根据选中对象触发 overcharge、repair、suppress 或 scan。
   - 支持 `stabilize`、`boost`、`suppress` outpost mode，影响 TCA 自动响应。
   - 支持 station priority 调整，影响 scout dispatcher。

完成定义：

- pressure event 会改变 world/GAS state，并通过 Renderer 表现出来。
- 玩家操作能触发 TCA rule 和 GAS ability，且能在舞台和 Timeline 中同时被观察。
- 自动规则能根据 mode、priority 和当前状态做不同响应。
- EventBus 仍只承载低频事实，不承载每帧移动或动画。

### Phase 10.5C：成长、资源与表现打磨

目标：让 Data/Asset/Renderer 的价值通过可见成长和表现变化体现出来。

任务拆分：

1. 成长层
   - Data Node 解锁新的 TCA rule、GAS ability、production recipe 或 station mode。
   - Asset Fabricator 解锁 render layer、状态灯、beam skin 或 cue effect。
   - Objective 分 phase 推进，每个 phase 解锁新自动化或新 pressure type。

2. Renderer 主舞台表现
   - 为不同角色创建不同复合 RenderObject，不再使用同质移动球表达主场景。
   - Command Core 显示进度光带和稳定度。
   - Relay Tower 显示 signal charge、beam 和过载状态。
   - Scout 显示任务状态、方向、携带 signal 和受击/修复反馈。
   - Interference Node 显示预警范围、干扰脉冲和 debuff 状态。
   - Signal Link 显示流动、断连、增强或污染状态。

3. Workbench 解释层
   - Inspector 从选中对象出发展示 world、render、data、asset、TCA/GAS 关联。
   - Timeline 合并 EventBus、TCA trace、GAS trace、renderer diagnostic，并突出链路，不做普通日志堆积。
   - Content summary 能展示 Data unlock、Asset loaded/failed 和被对象引用的 content。

4. Snapshot 与测试
   - 扩展 SandboxSnapshot：scene objects、links、production/threat/objective state、selected object detail。
   - fixed seed 下自动循环、pressure 和成长结果确定。
   - 测试 signal production、scout dispatch、threat damage、GAS effect、confirm overcharge、unlock、timeline 合并排序。
   - Browser 验收第一屏可见主舞台、objective、选中对象、timeline，并且无 console error。

完成定义：

- Data unlock 和 Asset unlock 能改变舞台表现或自动化能力。
- 复合 RenderObject 的结构和状态层足够区分不同对象职责。
- Workbench 不再靠模块卡片堆叠解释全部能力，而是围绕选中对象和事件链路组织。
- Browser 验收中，第一屏能看见 canvas、objective、选中对象、最近链路和主要资源/威胁流。

本阶段总完成定义：

- 主舞台能直接看出 Command Core、Relay Tower、Scout、Data Node、Asset Fabricator、Interference Node 和 Signal Link 的职责。
- 自动循环在无输入时持续推进 signal production、transport、threat 和 objective。
- 玩家输入可以选择对象并触发与 TCA/GAS 相关的能力。
- Data、Asset、World、Renderer、Input、Camera、TCA、GAS、EventBus、App Host 都在场景或 Workbench 中有可观察表达。
- Sandbox game module 不直接依赖 Phaser、Koota、DOM 或 App Host 内部实现。
- `corepack pnpm test`、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm format` 通过。

## Phase 10.6：真实内容组织与 DataType 重构

目标：把 Data / Asset 从“按资源类型或模块类型堆表”调整为“用户按真实业务内容组织，框架按 `type + id` 注册和索引”的长期模型。GameKit 不引入 ContentDomain 这类额外分类层，而是让游戏项目自由定义自己的数据类型和目录结构。

模块设计：

- `docs/modules/data.md`
- `docs/modules/assets.md`

当前状态：已实现。

设计原则：

- DataPack 是数据交付单元，不是完整 Content Package，也不是内容分类模型。
- 每条数据通过 `type + id` 声明自己的 DataType。
- DataType 可以是 GameKit 内置类型，也可以是用户自定义类型。
- Loader 只需要知道每条 entry 注册成什么类型，不理解 hero、monster、building 等业务分类。
- AssetRef 是数据字段中的显式资源引用，资源定义不要求和引用它的数据位于同一个 DataPack。

任务拆分：

1. Data 公共模型调整
   - 新增长期 `DataTypeDefinition`、`DataPackEntry`、`DataRef` 类型；Assets 模块提供 `AssetRef`。
   - 使用 DataType 作为唯一公共数据类型模型，不保留旧 kind 公共入口。
   - DataRegistry 查询 API 明确以 `type + id` 为主键。

   当前状态：已实现。`@gamekit/data` 已支持 `registerType()`、`entries[]`、`type + id` 查询和 `types` snapshot，旧 kind / 旧注册入口 / data map 兼容层已移除。

2. DataPack loader 调整
   - 支持 `entries: Array<{ type; id; data }>` 的真实内容交付结构。
   - 默认 unknown type 报错；unknown type 暂存仅作为未来编辑器/导入器扩展点保留。
   - 错误报告包含 pack id、entry type、entry id、字段路径和 source。

   当前状态：已实现。DataPack 只接受显式 `entries[]`；每条 entry 必须声明 `type + id + data`。unknown type 默认报错。

3. 引用系统调整
   - DataTypeDefinition 通过 `references` 提取 DataRef / AssetRef。
   - Reference graph 支持按 entry、type、pack、target 反查。
   - AssetRef 缺失目标由 Data/Asset 协同报告，但不强制资源定义同包。

   当前状态：已实现核心 `type + id` reference graph；AssetRef 作为 Assets 公共类型导出，缺失资源仍通过 `asset.definition` 引用链报告。

4. Asset 对齐
   - `asset.definition` 作为 DataType 注册。
   - AssetManager 从 DataRegistry 读取 AssetDefinition，也允许从编辑器/importer/远程 manifest 注册同形定义。
   - Asset snapshot 能显示资源被哪些 DataRef/AssetRef 间接引用。

   当前状态：已实现。`createAssetDataType()` 和默认 `asset.definition` 已实现；AssetManager 默认读取 `asset.definition`。旧 `asset` data kind 入口已移除，Asset snapshot 反查引用由 DataRegistry reference graph 提供。

5. Sandbox 内容重组
   - 拆分当前巨大的 sandbox data 文件，按 Signal Outpost 业务概念组织，例如 core、stations、scouts、threats、objectives。
   - 每个业务文件允许混合 station、GAS、TCA、render、asset 等不同 DataType。
   - Inspector Content tab 从“按类型统计”升级为“选中对象关联的 data entries、refs、assets 和 source pack”。

   当前状态：已实现第一步。Sandbox DataPack 已改为 `entries[]`，内容入口拆到 `content/core`、`content/stations`、`content/scouts`、`content/threats`、`content/objectives`、`content/visuals`；Inspector 文案已切到 Types。更细的“选中对象关联 content graph”留给后续 Workbench 打磨。

完成定义：

- 用户自定义 DataType 能注册、校验、索引和被查询。
- 一个 DataPack 可以混合内置类型和用户自定义类型。
- 同一个业务文件可以定义 hero/building/scout 所需的多种类型数据，不需要按类型拆表。
- DataRef / AssetRef 缺失时错误能定位到 pack、entry 和字段路径。
- 资源定义可以在独立 pack 中，引用它的数据仍能通过 AssetRef 校验和加载。
- Sandbox 内容重组后，DataRegistry snapshot 和 Inspector 能说明选中对象来自哪些 entry 和引用了哪些资源。
- `corepack pnpm test`、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm format` 通过。

## 已暂缓：DataPack Loading / Bootstrap

结论：暂不单独实现 DataPack loading pipeline 或 Data Registry Bootstrap。原因是未来 Content Package System 会负责内容发现、读取、解压、权限、实际资源文件、脚本、localization、mod metadata 和 section 分发；如果现在在 Data 或 App Host 中实现 DataPackSource / DataPackLoader / DataPackManifest，后续大概率会被内容包系统替换。

当前长期边界：

- Data 模块只消费已经物化的 DataPack，不定义 source / loader / manifest。
- App Host 可以接收 app/profile/test fixture 提供的 DataTypeDefinition 和 DataPack，但不实现 DataPack 加载系统。
- AssetManager 从 DataRegistry 或外部同形 manifest 读取 AssetDefinition，不读取 DataPack，不管理内容包。
- 未来 Content Package System 将把 data section 解包为 DataPack，再交给 DataRegistry；把 asset section 分发给 Asset / Platform；把 script section 分发给脚本运行时或安全 adapter。

## Phase 11：UI Core + React UI

目标：建立 UI Core 协议和 React UI 实现，让 Sandbox Workbench、未来 DevTools、Editor 和 Hero Road 可以复用统一 panel/window/focus/command/snapshot 模型。React 只处理 HUD、Inspector、Timeline、window、modal、DevTools 等低频 UI，不进入 world tick、renderer patch 或 gameplay 主循环。

模块设计：`docs/modules/ui.md`

当前状态：首轮垂直切片已实现。已建立 `ui-core` / `react-ui` 包、App Host 可选 UI service、Sandbox React shell、Input focus bridge、React UI 基础样式、GSAP 动效 helper 和 Signal Outpost theme 覆盖。Sandbox 现在通过场景对象自然验证 UI：选中实体会在 renderer stage 上显示 focus 框和对象浮层，场景点击只执行 focus/inspect，`UiModalHost` 改由 Objective Briefing 这类明确低频操作触发。完整 DevTools、Editor、复杂组件库和游戏 HUD 皮肤仍属于后续阶段。

已实现：

- `@gamekit/ui-core`
- `@gamekit/react-ui`
- `UiRuntime`、panel/window、command、focus、snapshot 协议
- React `GameKitUiShell`、runtime provider、panel/window/modal host、focus bridge
- React `GameKitStyleProvider`、Tailwind 默认工具型样式、GSAP UI 动效 helper、轻量 `UiTip` primitive
- App Host `services.ui` 标准服务入口和 lifecycle snapshot
- Sandbox Workbench shell 迁移到 React 渲染
- Sandbox Inspector / Timeline / HUD 作为已注册 UI panels 进入 UI runtime
- Sandbox scene UI overlay 能跟随选中实体显示 focus 框、对象摘要和操作按钮，场景对象点击不弹窗，只切换选中和 inspector；Objective Briefing 通过 `UiModalHost` 打开 modal，并用 `UiTip` 展示上下文提示
- UI focus 与 Sandbox Input scope 联动，game viewport 聚焦时 gameplay input 生效，UI 聚焦时回到 UI scope

预期新增：

- 更完整的工具型组件库
- React panel 内容组件化
- DevTools / Editor 复用 UI runtime

设计原则：

- `@gamekit/ui-core` 是 headless 协议层，不依赖 React、DOM、World、Renderer、TCA、GAS 或具体 app。
- `@gamekit/react-ui` 是 UI adapter / implementation，不泄漏第三方组件类型给 gameplay。
- UI style/theme 属于 React UI / app 层；`ui-core` 不定义 theme，也不暴露 CSS class、ReactNode、Tailwind class、shadcn/ui 或 Base UI 类型。
- Tailwind CSS 和 GSAP 只属于 `@gamekit/react-ui` / app UI 实现层；shadcn/ui 是推荐组件 recipe 实践，不进入 gameplay 公共 API。
- UI focus 必须能影响 Input Scope / Context，文本框、Inspector、DevTools 或 modal 聚焦时不误触发 gameplay input。
- Sandbox gameplay module、Renderer sync、World system 不 import React。
- UI 只消费低频 snapshot、selector、EventBus fact 和 command，不订阅每帧 ECS position。

任务拆分：

1. UI Core 协议
   - 定义 `UiRuntime`、`UiPanelDefinition`、`UiWindowDefinition`、`UiCommand`、`UiFocusState`、`UiSnapshot`。
   - 支持 register/unregister panel、open/close/toggle window、dispatch command、set focus、snapshot。
   - 提供 memory runtime 和基础测试，便于 headless app / DevTools / Editor 复用。

2. React UI 实现
   - 实现 `RuntimeProvider`、`GameShell`、`PanelHost`、`WindowHost`、`ModalHost`、`OverlayHost`。
   - 提供 FocusBridge，把 DOM/React focus 状态映射到 UI runtime 和 Input scope。
   - 提供基础工具型组件：Button、IconButton、Tabs、Panel、Window、Timeline、InspectorTable、JsonView、StatBar、TagList。
   - 可引入 Tailwind/Zustand；shadcn/ui 只作为封装实现选项，不让业务 app 直接依赖。

3. UI Style / Theme
   - `ui-core` 不增加 theme API，继续保持 headless panel/window/command/focus/snapshot 协议。
   - React UI 提供 `GameKitStyleProvider` / React-only theme provider，用 Tailwind CSS 组织默认工具型样式，并把必要变量注入为 CSS variables 或 class。
   - React UI 以 GSAP 作为低频 UI 动效基础，用于 window/modal/toast/timeline/inspector 的进入、退出、强调和布局过渡。
   - shadcn/ui 作为推荐最佳实践，组件 recipe 应封装在 `@gamekit/react-ui` 或游戏 UI 包中，不能让业务代码到处直接依赖第三方 primitive。
   - 定义 shell、panel、window、modal、toolbar、focus ring、density、reduced motion 的 React UI 默认样式。
   - Sandbox 定义自己的 Signal Outpost theme 和组件层，逐步替代散落硬编码颜色。
   - App Host/Profile 可以传递不透明的 React UI style 参数，但不解释 CSS 细节或主题协议。

4. App Host 接入
   - 增加可选 `services.ui` 标准入口。
   - UI service 进入统一 lifecycle：boot/start/stop/dispose/snapshot。
   - Host diagnostics 展示 UI shell phase、已注册 panels、打开窗口和 focus scope。
   - Headless 测试可使用 memory UI runtime，不需要 DOM。

5. Sandbox Workbench 迁移
   - 将当前 vanilla DOM 的 HUD、Inspector、Timeline、Content/Asset/Data/Host summary 迁移为 React panels。
   - Phaser canvas 仍由 renderer service 管理，React shell 只负责布局和 overlay。
   - Signal Outpost game module 不依赖 React 或 UI package 的实现组件。
   - 现有 fixed seed integration test 保持稳定。

6. Input focus 协作
   - game viewport focused 时，WASD / confirm 等 gameplay action 生效。
   - UI panel、modal、text input、DevTools focused 时，gameplay/camera action 被 scope gate 阻断或降级。
   - 增加测试覆盖 focus → Input scope 的协作边界。

完成定义：

- `@gamekit/ui-core` 不依赖 React、DOM、Renderer、World、TCA、GAS 或具体 app。
- Sandbox 第一屏由 React shell 渲染 Workbench UI，Phaser canvas 正常运行。
- Sandbox 能通过真实 UI runtime 从场景对象打开 modal，并在 renderer stage 上展示对象 focus/summary UI。
- Inspector、Timeline、Host summary、Content/Asset/Data summary 已注册到 UI runtime；后续继续迁移为 React panel 内容组件。
- React UI 基础组件有默认样式，Sandbox 能通过自己的 theme/component library 覆盖视觉语言。
- UI focus 能和 Input Context / Scope 协作，避免 UI 聚焦时误触发 gameplay/camera input。
- React UI 只消费低频 selector/snapshot/EventBus fact，不进入主循环。
- gameplay packages 和 Sandbox game modules 不直接 import React、shadcn/ui、Base UI 或 DOM panel implementation。
- `corepack pnpm test`、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm format` 通过。

暂不做：

- 完整 DevTools。
- Editor。
- 复杂游戏 HUD 皮肤系统。
- Content Package System。

## Phase 12：Save / Load / Migration

目标：长期状态可以序列化、恢复和迁移，为真实 demo 提供基础。

模块设计：`docs/modules/save.md`

预期新增：

- `@gamekit/save`
- SaveGame schema
- migration registry

完成定义：

- 固定 seed + save/load 后，后续 tick 结果确定。
- Save 通过 PlatformStorage / PlatformFileSystem，不直接依赖 localStorage 或 Tauri FS。
- 缺失/未知版本能给出明确错误。
- migration 至少有一个测试样例。

## Phase 13：DevTools

目标：游戏可调试，尤其是数据驱动逻辑可解释。

模块设计：`docs/modules/devtools.md`

预期新增：

- `@gamekit/devtools`
- DevTools trace model
- DevTools React panels
- System profiler 基础数据

完成定义：

- 在 sandbox 或 demo 中能打开 DevTools 面板。
- 点击事件能看到关联 TCA trace、状态变更、后续 event。
- system profiler 至少记录 system id、调用次数、最近耗时。
- renderer escaped/native/direct path 可被标记。

## Phase 14：Hero Road Demo

目标：用一个真实小 demo 验证整套架构，而不是只靠 sandbox。

模块设计：`docs/modules/hero-road.md`

预期新增：

- `apps/hero-road`
- Hero Road game modules
- Hero Road data packs
- Hero Road UI windows
- Hero Road renderer/input/camera/platform integration

完成定义：

- Demo 能从 DataPack 启动。
- 英雄能移动并触发至少一个 TCA random event。
- Basic Attack Ability 能通过 GAS 执行。
- Event Log / Actor Detail / TCA Trace 可查看。
- Save/Load 能恢复 demo 基础状态。

## Phase 15：Editor / Tooling

目标：为 DataPack、地图、规则、资源提供编辑和验证入口。

预期新增：

- `apps/editor`
- DataPack import/export
- Rule/Asset/Actor inspectors
- Editor IO adapter

完成定义：

- 能加载 demo DataPack。
- 能验证并展示 assets、actors、rules、renderObjects 等 data entries。
- 不把 editor-only 状态泄漏到 runtime core。

## Phase 16：Content Package System

目标：建立真正的内容包系统，让游戏、DLC、mod、编辑器导出包和远程活动包可以作为一个可挂载、可卸载、可诊断、可权限控制的分发单元进入应用。Content Package 不等同于 DataPack；DataPack 只是内容包中的一个 section。

预期新增：

- `@gamekit/content`
- ContentPackageManifest
- ContentPackageSource
- ContentPackageLoader
- ContentMountRuntime
- ContentSectionLoader
- package dependency / compatibility / permission diagnostics

内容包可以包含：

- DataPack section
- asset payload / asset manifest / file map
- script modules
- localization bundles
- maps / levels
- patches
- mod metadata
- permissions / capability requirements

完成定义：

- Content package 可以声明多个 section，并把 data section 物化为 DataPack 后交给 DataRegistry，把 asset section 分发给 Asset / Platform，把 script section 分发给脚本运行时或安全 adapter。
- 内容包依赖、版本兼容、权限需求和冲突能被诊断。
- 内容包 mount / unmount 生命周期可被 App Host 或 Editor 编排。
- Data、Asset、Script、Localization 等模块保持各自职责，不被 Content Package System 吞并。
- Sandbox 或 Hero Road 至少能挂载一个额外内容包，新增数据和资源，并在 UI/diagnostics 中显示来源。

## Phase 17：Three.js / 3D Renderer Backlog

目标：验证 RendererAdapter 能支持未来 3D 后端。

预期新增：

- `@gamekit/renderer-three`
- 3D render object adapter
- camera-three

完成定义：

- Three adapter 能 boot/destroy/create/update 基础对象。
- RenderObject / Camera 协议不足时，通过 ADR 记录协议调整原因。

## 横向要求

每个阶段都必须同步维护：

- `docs/architecture.md`：新增包、依赖方向、adapter 边界摘要。
- `docs/modules/`：模块长期设计。
- `docs/implementation-principles.md`：新增实现原则或代码质量要求。
- `docs/best-practices.md`：新增已验证实践、反模式、性能经验。
- `docs/adr/`：高影响技术决策。
- 测试：单元测试、契约测试、集成测试按风险补齐。

每个阶段提交前至少验证：

```bash
corepack pnpm test
corepack pnpm build
corepack pnpm lint
corepack pnpm format
```

涉及 world/renderer/input/camera/TCA/asset 性能路径时，补 benchmark 或 profiler 数据。
