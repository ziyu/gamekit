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
- DOM input adapter
- Phaser input adapter fake-driver contract
- Sandbox Input 状态展示和低频 `input.action` 事件桥接

完成定义：

- input-core 不依赖 DOM、Phaser、Tauri。
- Sandbox 能观察一个最小 input action。
- Renderer 不重新引入 `onInput`。
- EventBus 只接收低频输入事实或 gameplay command，不接收高频 raw event。
- binding、context 优先级、adapter normalization 有测试覆盖。

## Phase 5：Camera Core

目标：统一 2D camera 控制，为后续地图、编辑器、Cue 和 Renderer adapter 打基础。

模块设计：`docs/modules/camera.md`

预期新增：

- `@gamekit/camera-core`
- `@gamekit/camera-phaser`
- CameraState2D
- CameraController
- GridMapRig

完成定义：

- CameraController 不依赖 Phaser。
- Phaser adapter 能应用 CameraState2D。
- Input action 可以驱动 pan/zoom/follow。
- Renderer/camera 坐标转换有最小测试覆盖。

## Phase 6：Asset System + DataPack 基础

目标：资源通过 AssetManifest 声明和加载，DataPack 统一注册 assets、renderObjects、gameplay definitions、rules。

模块设计：`docs/modules/asset-data.md`

预期新增：

- `@gamekit/asset`
- `@gamekit/asset-phaser`
- `@gamekit/data`
- DataPack validation tests

完成定义：

- Sandbox 可以通过 manifest 注册并加载至少一个 image/spritesheet asset。
- DataPack 支持 `renderObjects`。
- renderer-phaser 从 AssetManager/asset adapter 获取资源，而不是硬编码 URL。
- DataPack 校验能报告缺失 assetId、重复 id、未知 render type、未知资源类型。

## Phase 7：TCA 规则系统

目标：Trigger / Condition / Action 数据驱动规则系统跑通，并从第一版开始可追踪。

模块设计：`docs/modules/tca.md`

预期新增：

- `@gamekit/tca`
- Rule conformance tests
- Trace fixtures

完成定义：

- EventBus event 能触发 TCA rule。
- condition/action handler 可由 GameModule 注册。
- trace 能回答“哪个事件触发了哪些规则、哪些 condition 失败、执行了哪些 action”。
- TCA 不用于每帧高频逻辑；规则按 event type 索引并预编译。

## Phase 8：GAS

目标：Actor、Attribute、Tag、Ability、Effect、Cue、Clue 基于 TCA 跑通。

模块设计：`docs/modules/gas.md`

预期新增：

- `@gamekit/gas`
- Actor/Ability/Effect definition tests
- Ability → TCA Rule compile tests

完成定义：

- Basic Attack Ability 能通过 event 激活并修改目标状态。
- Active effect 可以按 runtime tick 更新 duration/periodic action。
- GAS trace 能关联 ability/effect 与 TCA rule trace。
- 示例 actor 数据通过 DataPack 注册和校验。

## Phase 9：UI Core + React UI

目标：通用 UI 状态模型和 React 实现跑通，React 只处理 HUD/window/modal/devtools，不进入主循环。

模块设计：`docs/modules/ui.md`

预期新增：

- `@gamekit/ui-core`
- `@gamekit/react-ui`
- Tailwind CSS
- Zustand
- shadcn/ui 基础组件封装

完成定义：

- Sandbox 或示例 app 能打开/关闭窗口并显示 event log。
- React UI 只消费低频 selector/snapshot。
- UI focus 能和 Input Context 协作。
- 游戏业务不直接依赖原始 shadcn/base primitive。

## Phase 10：Save / Load / Migration

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

## Phase 11：DevTools

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

## Phase 12：Hero Road Demo

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

## Phase 13：Editor / Tooling

目标：为 DataPack、地图、规则、资源提供编辑和验证入口。

预期新增：

- `apps/editor`
- DataPack import/export
- Rule/Asset/Actor inspectors
- Editor IO adapter

完成定义：

- 能加载 demo DataPack。
- 能验证并展示 assets、actors、rules、renderObjects。
- 不把 editor-only 状态泄漏到 runtime core。

## Phase 14：Three.js / 3D Renderer Backlog

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
