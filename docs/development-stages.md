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
- InputAction / InputBinding / InputContext / InputRouter
- Input scope 过滤，支持 action/context 按 `game`、`ui` 等输入域生效
- DOM input adapter
- Phaser input source 已收敛为 `@gamekit/driver-phaser` 的内部 capability
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
- CameraState2D
- CameraController
- Phaser camera sync 已收敛为 `@gamekit/driver-phaser` 的内部 capability
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
- Asset DataType registration
- AssetManager
- Phaser asset loader 已收敛为 `@gamekit/driver-phaser` 的内部 capability
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

## Phase 10.5：Sandbox Tiny Camp

目标：把 Sandbox 主场景调整为概念直觉、机制足够复杂的 `Tiny Camp` 自动放置 demo。基础概念是营地、工人、资源、建筑、防御塔和怪物；模块协作通过采集、搬运、建造、维修、防御、波次和升级自然体现，而不是依赖抽象架构隐喻。

设计文档：`docs/apps/sandbox.md`

当前状态：已完成 10.5A 和 10.5D。Sandbox 主循环、内容命名、舞台对象、Inspector 基础展示、Timeline 规则链路、渲染同步和长链路 runtime 测试已迁移为 Tiny Camp；后续 10.5B/10.5C 继续增强 monster wave、玩家操作、成长解锁和表现打磨。

迁移原则：

- 不保留 Signal Outpost 作为长期演示概念。
- 先迁移 Sandbox 内部内容、组件、snapshot、UI 文案和 DataType id，不上推 Tiny Camp 概念到核心包。
- 保持已经验证的技术边界：Sandbox game module 不直接依赖 Phaser、Koota、DOM 或 App Host 内部实现。
- 保持 App Host、Driver、Renderer、Input、Camera、Data、Asset、TCA、GAS 的现有公共边界不因 demo 换皮而破坏。

### Phase 10.5A：Tiny Camp 基础循环迁移

目标：把主舞台从 outpost 语义迁移为营地语义，并保留无输入自动推进。

任务拆分：

1. 内容和命名迁移
   - 将 sceneObject / station / productionRecipe / threatProfile / route 等 Sandbox 内容重命名为 worker、building、resourceNode、recipe、monster、wave、route/layout 等更直觉的业务类型。
   - DataPack 内容按 Tiny Camp 业务概念组织：camp、workers、buildings、resources、monsters、waves、recipes、visuals。
   - 保证所有内容仍通过 DataRegistry 注册、校验和引用追踪。

   当前状态：已实现。Sandbox 内容已拆为 core/buildings/workers/monsters/objectives/visuals，并通过 DataRegistry 的 `entries[]` 注册。

2. World 组件和场景模型
   - 新增或迁移 Sandbox-local components：SceneObject、Selectable、ResourceStorage、ProductionState、ConstructionState、WorkAssignment、ThreatState、CombatState、RouteState、RenderPresentation。
   - Campfire、Worker、Resource Node、Storage、Workshop、Tower、Monster 和 Road/Task Path 都能关联 entity、data definition、render object 和可选 GAS actor。

   当前状态：已实现基础模型。当前使用 ResourceStorage、BuildingState、ProductionState、WorkAssignment、ThreatState、LinkState、ObjectiveState 和 RenderObjectPresentation 表达 Tiny Camp 基础循环；Construction/Combat 后续随 10.5B/10.5C 细化。

3. 自动放置循环
   - 实现 resource production / gather / haul / storage。
   - 实现 build site / material delivery / construction progress。
   - 实现 Worker task dispatcher，按 gather、haul、build、repair、defend 分配任务。
   - 实现 Campfire objective，消耗资源或完成建筑推进阶段。

   当前状态：已实现基础循环。Worker 能采集、搬运、维修、防御和执行建造任务；Campfire objective 会随资源交付推进。

4. 主舞台结构
   - 固定空间语义：中央 Campfire，左侧 Forest，右侧 Quarry，下方 Food source，上方 Storage/Workshop，边缘 Monster Path。
   - Worker 路线、资源流向、building progress 和 threat path 必须可见。

   当前状态：已实现基础舞台。Campfire、Forest、Quarry、Berry Patch、Storage、Workshop、Watchtower、Monster Den、Road/Task Path 均使用独立场景对象和 RenderObject 表达。

完成定义：

- 无输入时，场景能持续采集、搬运、建造、消耗资源并推进 objective。
- Worker 有清晰任务状态、目标、携带资源和路线。
- 主舞台第一眼能看懂“营地正在生产、防御和成长”。

### Phase 10.5B：压力、规则与能力链路

目标：让 TCA/GAS 成为营地里的自动化和状态变化机制，而不是面板中的 trace 样例。

任务拆分：

1. Monster wave 和压力层
   - 实现 Monster 从边缘路径进入，攻击 Worker、Tower、Storage 或 Campfire。
   - 实现 burning、poisoned、stunned、fortified、repairing 等 effect。
   - 压力影响生产、路线、建筑生命、Worker 效率或 objective progress。

2. TCA / GAS 链路增强
   - 扩展 TCA rules：building low health repair、wave started defense response、storage full build decision、recipe completed unlock、selected target confirm。
   - 扩展 GAS 数据：worker boost、quick repair、tower shot、monster bite、build boost、rally worker。
   - Timeline 必须能看到 input → TCA → GAS → effect/cue → scene feedback。

3. 玩家操作
   - 支持选择 worker、building、resource、monster 和 route。
   - `confirm` 根据选中对象触发 boost、repair、prioritize construction、focus tower fire 或 rally worker。
   - 支持 `gather`、`build`、`defend` camp mode，影响 TCA 自动响应和 Worker dispatcher。
   - 支持优先级调整，影响 Worker 任务分配。

完成定义：

- monster event 会改变 world/GAS state，并通过 Renderer 表现出来。
- 玩家操作能触发 TCA rule 和 GAS ability，且能在舞台和 Timeline 中同时被观察。
- 自动规则能根据 mode、priority 和当前状态做不同响应。
- EventBus 仍只承载低频事实，不承载每帧移动或动画。

### Phase 10.5C：成长、资源与表现打磨

目标：让 Data/Asset/Renderer 的价值通过可见成长和表现变化体现出来。

任务拆分：

1. 成长层
   - Workshop 解锁新的 recipe、building blueprint、tool、worker role 或 tower upgrade。
   - Campfire objective 分阶段推进，每个阶段解锁新自动化或新 monster wave。
   - Asset 加载成功后改变建筑、Worker、Monster、Tower shot 或 UI icon 的表现。

2. Renderer 主舞台表现
   - 为 Campfire、Worker、Resource Node、Storage、Workshop、Tower、Monster 和 Road/Task Path 创建不同复合 RenderObject。
   - Campfire 显示生命、目标阶段和营地范围。
   - Worker 显示方向、任务图标、携带资源、体力和状态效果。
   - Building 显示库存、建造进度、维修状态和升级层。
   - Monster 显示路径、生命、攻击预警和 debuff。

3. Workbench 解释层
   - Inspector 从选中对象出发展示 world、render、data、asset、TCA/GAS 关联。
   - Timeline 合并 EventBus、TCA trace、GAS trace、renderer diagnostic，并突出链路，不做普通日志堆积。
   - Content summary 能展示 Data unlock、Asset loaded/failed 和被对象引用的 content。

4. Snapshot 与测试
   - 扩展 SandboxSnapshot：scene objects、resources、construction、combat、wave、objective、selected object detail。
   - fixed seed 下自动循环、monster wave、GAS effect、unlock 和成长结果确定。
   - Browser 验收第一屏可见主舞台、objective、选中对象、timeline，并且无 console error。

完成定义：

- Data unlock 和 Asset unlock 能改变舞台表现或自动化能力。
- 复合 RenderObject 的结构和状态层足够区分不同对象职责。
- Workbench 不再靠模块卡片堆叠解释全部能力，而是围绕选中对象和事件链路组织。
- Browser 验收中，第一屏能看见 canvas、objective、选中对象、最近链路和主要资源/威胁流。

### Phase 10.5D：Sandbox 长链路集成测试

目标：为 Tiny Camp 建立一套长期维护的长链路集成测试，确保 Sandbox 的所有核心机制和跨模块协作持续运转正常。详细测试职责和长期场景定义见 `docs/apps/sandbox.md` 的“长链路测试要求”。

当前状态：已实现。Sandbox 已新增 headless harness、snapshot assertions、long-chain scenarios 和 `sandbox-long-chain.test.ts`，覆盖 boot、idle automation、input/TCA/GAS、monster pressure、render sync、selection/camera/input scope 和 content reference 链路。

任务拆分：

1. 测试 harness
   - 新增 `apps/sandbox/src/test/sandbox-harness.ts`。
   - 提供固定 seed 创建 Sandbox runtime、memory renderer、fake asset summary、tick helper、snapshot helper、input helper。
   - 提供常用查找函数，例如按 role、objectId、actorId、timeline kind、renderer object 查询。

2. 快照断言工具
   - 新增 `apps/sandbox/src/test/snapshot-assertions.ts`。
   - 封装 deterministic snapshot、timeline chain、content reference、renderer object/node patch、selection/camera/input scope 等断言。
   - 避免测试直接依赖完整数组顺序和脆弱时间点，优先使用存在性、区间、单调增长和固定 seed 片段。

3. 长链路场景定义
   - 新增 `apps/sandbox/src/test/long-chain-scenarios.ts`。
   - 把 boot、idle automation、confirm、monster pressure、render sync、selection/camera、content reference 等步骤做成可复用 scenario。
   - scenario 只描述行为步骤和观察点，不夹杂 UI DOM 实现细节。

4. Runtime 长链路测试
   - 新增 `apps/sandbox/src/sandbox-long-chain.test.ts`。
   - 覆盖 Boot Chain、Idle Automation Chain、Input → TCA → GAS Chain、Monster Pressure Chain、Render Sync Chain、Selection / Camera / Input Scope Chain、Content Reference Chain。
   - 默认使用 memory renderer 和 headless runtime，纳入 `corepack pnpm test`。

5. Browser smoke 验收入口
   - 保留轻量浏览器验收策略：启动 Vite 后检查第一屏、canvas、Inspector、Timeline、无 console error、关键点击/confirm 行为。
   - Browser smoke 不替代 runtime 长链路测试，也不做像素级视觉回归。

完成定义：

- `corepack pnpm test` 中包含 Sandbox 长链路 runtime 测试。
- 固定 seed 下 Tiny Camp 自动循环可复现，且 resource、worker、route、objective、threat、GAS、TCA、renderer sync 都被覆盖。
- `confirm` 能被测试证明走完整 input/event → TCA → GAS → effect/cue → timeline 链路。
- selection、空白点击取消、camera follow/free 和 input scope gate 有端到端覆盖。
- Data/Asset/content reference 能从选中对象反查到 source pack、render、asset、GAS/TCA 相关 entry，且没有 missing reference diagnostic。
- 测试工具按 harness/assertions/scenarios 拆分，不把所有逻辑堆在单个测试文件中。
- `corepack pnpm test`、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm format` 通过。

本阶段总完成定义：

- 主舞台能直接看出 Campfire、Worker、Resource Node、Storage、Workshop、Tower、Monster 和 Road/Task Path 的职责。
- 自动循环在无输入时持续推进 gather、haul、build、defend、repair 和 objective。
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
   - 拆分当前巨大的 sandbox data 文件，按真实业务概念组织，例如 camp、workers、buildings、resources、monsters、waves、objectives。
   - 每个业务文件允许混合 building、GAS、TCA、render、asset 等不同 DataType。
   - Inspector Content tab 从“按类型统计”升级为“选中对象关联的 data entries、refs、assets 和 source pack”。

   当前状态：已实现第一步并完成 Tiny Camp 语义迁移。Sandbox DataPack 已改为 `entries[]`，内容入口已按 core/buildings/workers/monsters/objectives/visuals 拆分；更细的“选中对象关联 content graph”留给后续 Workbench 打磨。

完成定义：

- 用户自定义 DataType 能注册、校验、索引和被查询。
- 一个 DataPack 可以混合内置类型和用户自定义类型。
- 同一个业务文件可以定义 hero/building/worker 所需的多种类型数据，不需要按类型拆表。
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

当前状态：首轮垂直切片已实现。已建立 `ui-core` / `react-ui` 包、App Host 可选 UI service、Sandbox React shell、Input focus bridge、React UI 基础样式、GSAP 动效 helper 和 Sandbox theme 覆盖。Sandbox 现在通过场景对象自然验证 UI：选中实体会在 renderer stage 上显示 focus 框和对象浮层，场景点击只执行 focus/inspect，`UiModalHost` 改由明确低频操作触发。完整 DevTools、Editor、复杂组件库和游戏 HUD 皮肤仍属于后续阶段。

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
   - Sandbox 定义自己的 Tiny Camp theme 和组件层，逐步替代散落硬编码颜色。
   - App Host/Profile 可以传递不透明的 React UI style 参数，但不解释 CSS 细节或主题协议。

4. App Host 接入
   - 增加可选 `services.ui` 标准入口。
   - UI service 进入统一 lifecycle：boot/start/stop/dispose/snapshot。
   - Host diagnostics 展示 UI shell phase、已注册 panels、打开窗口和 focus scope。
   - Headless 测试可使用 memory UI runtime，不需要 DOM。

5. Sandbox Workbench 迁移
   - 将当前 vanilla DOM 的 HUD、Inspector、Timeline、Content/Asset/Data/Host summary 迁移为 React panels。
   - Phaser canvas 仍由 renderer service 管理，React shell 只负责布局和 overlay。
   - Sandbox game module 不依赖 React 或 UI package 的实现组件。
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

## Phase 12：Driver Core + Phaser Driver 收敛

目标：把 Phaser 这类跨 renderer、asset、input、camera 的第三方运行时，从分散 adapter 模式收敛为统一 Driver 模式，为未来 Three.js / 3D 集成建立稳定边界。

模块设计：`docs/modules/driver.md`

决策记录：`docs/adr/0007-driver-integration-layer.md`

当前状态：首轮已实现。

已实现：

- `@gamekit/driver-core`
- `@gamekit/driver-phaser`
- Driver lifecycle / capability / adapter map / snapshot
- App Host driver service registry
- Phaser Driver 暴露 renderer、asset loader、input source、camera sync adapter
- Sandbox 通过 App Host profile 选择 Phaser Driver capability
- Renderer Phaser runtime 向 Driver 暴露共享 input / asset / camera runtime port
- Driver registry 和 App Host standard driver service 测试
- Sandbox 不再直接组装独立 Phaser adapter

迁移范围：

- `asset-phaser`、`input-phaser`、`camera-phaser` 已收敛进 `driver-phaser` 内部实现，不再作为长期 package 保留。
- App Host 标准 renderer/assets/input/camera 可以从 Driver capability 自动解析，Sandbox profile 只需要声明 Phaser driver 和少量业务配置。
- Camera 继续作为标准 GameModule helper；Phaser Driver 只提供 renderer camera adapter。
- Core protocol 包继续不依赖 Phaser。

完成定义：

- App Host 可以 boot/start/stop/dispose driver service，并在 snapshot 中展示 driver capability。
- Sandbox 只配置一个 Phaser Driver，不再手动组装多个独立 Phaser adapter。
- renderer、asset、input、camera sync 都来自同一个 Phaser runtime。
- 业务代码、GameModule、core protocol package 不直接 import `phaser`。
- 多 driver 场景下 profile 能显式选择标准服务使用哪个 driver capability。
- `corepack pnpm test`、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm format` 通过。

## Phase 13：Save / Load / Migration

目标：长期状态可以序列化、恢复和迁移，为真实 demo 提供基础。

模块设计：`docs/modules/save.md`

当前状态：首轮垂直切片已实现并完成一次边界修正。已新增 `@gamekit/save` 核心协议、JSON codec、memory/platform storage store、migration registry、SaveManager、contributor policy / selection、App Host `services.save` 标准入口、可配置 contributor service context 和基础测试。Sandbox 已接入本地 storage slot、Host tab Save/Load 交互和 Tiny Camp gameplay contributor，可验证保存后修改状态再加载恢复。World/GAS/TCA/Camera 的通用标准 contributor helper 仍属于本阶段后续实现。

预期新增：

- `@gamekit/save`
- Save envelope / payload / slot metadata
- SaveManager
- SaveStore / SaveCodec
- SaveContributor protocol
- Migration registry
- Memory / Platform-backed store
- App Host `services.save`
- Save diagnostics / snapshot

设计原则：

- Save 是框架级能力，不是某个 demo 的存档脚本。
- `@gamekit/save` 定义协议、manager、store、codec、migration 和 contributor registry，不直接依赖 GAS、TCA、Camera、Renderer、React、Koota、Phaser 或具体游戏。
- GAS、TCA、Camera 和具体游戏通过 SaveContributor 注册 capture / restore 行为。
- Platform 提供 storage / file 能力；Save 不直接调用 localStorage、Tauri FS 或浏览器私有 API。
- Data / Asset / Content Package 通过 id、version 和 compatibility metadata 参与恢复，不把完整 DataPack、Asset binary 或 Content package payload 嵌入普通存档。
- 保存 runtime/gameplay 长期状态，不保存 renderer native handle、React component state、adapter cache 或每帧临时状态。

任务拆分：

1. Save Core 协议
   - 新增 `@gamekit/save`。
   - 定义 `SaveEnvelope`、`SavePayload`、`SaveSection`、`SaveSlotMetadata`、`SaveCompatibilityMetadata`。
   - 定义稳定错误码、diagnostic 结构和 snapshot 模型。
   - 提供 JSON codec，默认可读、可迁移、可 checksum。

2. Store / Codec
   - 实现 `SaveStore` 协议：list/read/write/delete/exists。
   - 实现 `MemorySaveStore` 用于测试。
   - 实现基于 PlatformStorage 或 PlatformFileSystem 的 store。
   - 明确默认路径：`appData/saves`，写入支持临时文件/替换语义，失败不破坏旧存档。

3. Contributor Registry
   - 实现 `SaveContributor` 注册、排序、capture、restore、validate。
   - 支持 required / optional section 语义。
   - Contributor 使用 id、scope、tags 描述保存范围，SaveManager 支持全局 policy 和单次 save/load selection。
   - Capture/restore context 默认只暴露 Data、Asset 和 GameRuntime；其他 Host service 必须由 profile 显式 opt-in，避免保存逻辑依赖 renderer/input/UI/platform 私有对象。
   - Restore 支持 entity remap，供 World/GAS/TCA 等 section 恢复引用。

4. Migration Registry
   - 实现 `SaveMigrationRegistry`。
   - 支持 from/to migration plan。
   - 缺失迁移路径、未知版本、迁移失败给出稳定错误。
   - 至少提供一个旧版本 envelope 到当前版本的迁移测试样例。

5. Standard Contributors
   - 实现或预留基础 runtime contributor：seed、clock、rng state。
   - 实现 world contributor 的最小协议：只保存显式声明可保存的 component，不保存 ECS adapter 内部状态。
   - 让 GAS/TCA 在各自包中提供 save contributor helper，避免 `@gamekit/save` 直接依赖它们。
   - Camera/UI 状态作为 optional contributor，默认只保存可恢复的用户视角或 UI layout，不保存组件实例。

6. App Host 集成
   - App Host 增加可选标准 `services.save`。
   - Profile 可配置 store、codec、format version、contributor policy、service context、autosave strategy 和 contributor helper。
   - Host diagnostics 展示 save service phase、slots、最近 save/load 结果、migration 和 compatibility issue。
   - Headless Host fixture 支持 MemorySaveStore。

7. Integration Verification
   - 固定 seed runtime tick N 次后保存。
   - 新 runtime load 后继续 tick M 次。
   - 与未中断 runtime snapshot 对比。
   - 覆盖 corrupted save、missing slot、unsupported version、missing migration、missing contributor、missing data/asset compatibility。
   - Sandbox 只做最小验证入口：Host tab 可保存当前 runtime gameplay 状态到本地 storage，并可加载回当前 Tiny Camp runtime，证明基础状态恢复；不继续扩展玩法。

完成定义：

- 固定 seed + save/load 后，后续 tick 结果确定。
- Save 通过 PlatformStorage / PlatformFileSystem，不直接依赖 localStorage 或 Tauri FS。
- 缺失/未知版本能给出明确错误。
- migration 至少有一个测试样例。
- `@gamekit/save` 不依赖 Phaser、React、Koota、Tauri adapter、GAS/TCA 具体实现或具体 app。
- SaveManager 支持 slot list/save/load/delete/inspect/snapshot。
- Contributor capture/restore 顺序可配置、可测试，失败能定位到 contributor 和 section。
- World/GAS/TCA 等状态通过 contributor 恢复，renderer native handle 和 React state 不进入 payload。
- App Host 可以通过 `services.save` 管理 save lifecycle 和 diagnostics。
- `corepack pnpm test`、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm format` 通过。

## 横向补全：已实现模块最佳实践文档

目标：在进入 DevTools 之前，为当前已经实现或已经形成稳定边界的模块补齐长期最佳实践，降低后续开发重复踩边界问题的概率。

当前状态：已完成首轮补全。

范围：

- `docs/best-practices.md` 增加模块最佳实践索引和跨模块通用实践。
- `docs/modules/` 中已实现模块补充“最佳实践”段落。
- `docs/apps/sandbox.md` 补充 Sandbox 作为验证面的实践边界。
- `AGENTS.md` 补充后续开发维护最佳实践的规则。

完成定义：

- 已实现模块都有模块专属最佳实践入口。
- 跨模块通用规则集中在 `docs/best-practices.md`，不在多个模块文档复制维护。
- 模块文档仍只写长期设计和长期实践，不写阶段状态、TODO、临时计划或完成定义。
- Sandbox 玩法细节不泄漏到核心模块文档。
- 文档格式检查通过。

## Phase 14：DevTools

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

## Phase 15：Hero Road Demo

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

## Phase 16：Editor / Tooling

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

## Phase 17：Content Package System

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

## Phase 18：Three.js / 3D Driver Backlog

目标：验证 Driver + RendererAdapter + Camera protocol 能支持未来 3D 后端。

预期新增：

- `@gamekit/driver-three`
- Three Driver 暴露 3D render object adapter
- Three Driver 暴露 3D camera sync adapter
- Three Driver 暴露 texture / model asset loader adapter
- Three Driver 暴露 raycaster / pointer input source

完成定义：

- Three Driver 能 boot/dispose/create/update 基础 3D 对象。
- renderer、asset、input、camera sync 来自同一个 Three runtime。
- RenderObject / Camera / Driver 协议不足时，通过 ADR 记录协议调整原因。

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
