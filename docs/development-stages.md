# 阶段路线图

本文档只负责阶段规划、当前状态、完成定义和阶段间依赖关系。长期项目定位放 `project-design.md`，包边界和依赖方向放 `architecture.md`，不要在这里重复维护。

## 阶段映射

当前仓库的 Phase 1 已合并完成原始设计文档中的前三个 MVP 步骤：

- 原 Phase 1：项目基础。
- 原 Phase 2：Core + World Adapter。
- 原 Phase 3：EventBus + GameRuntime。

从当前 Phase 2 开始，路线图继续按原始文档的能力顺序推进：Renderer → Input → Asset/Data → TCA → GAS → UI → DevTools → Hero Road Demo，并补上原始包职责中提到但阶段列表较少展开的 Animation/Fx、Save、Editor、Three.js 后续事项。

## Phase 1：Runtime 垂直切片

目标：证明 monorepo、薄内核、world facade、Koota adapter、EventBus、GameRuntime、Sandbox 可以协同工作。

已实现：

- pnpm workspace、Turbo、TypeScript、Vite、Vitest、oxlint、oxfmt。
- `@gamekit/core`：Registry、GameModule、RNG、Clock、GameError、Result。
- `@gamekit/world`：ECS facade、ComponentDef、GameWorld、WorldSystem。
- `@gamekit/world-koota`：Koota adapter、world conformance tests、benchmark。
- `@gamekit/event-bus`：低频事件总线、typed event shape、on/onAny/unsubscribe。
- `@gamekit/game-runtime`：module install、system registry、start/stop/tick。
- `@gamekit/test-utils`：测试辅助和 world conformance helper。
- `apps/sandbox`：runtime tick、实体运动、事件日志。

完成定义：

- `corepack pnpm test` 通过。
- `corepack pnpm build` 通过。
- `corepack pnpm lint` 通过。
- `corepack pnpm format` 通过。
- `corepack pnpm bench:world` 可运行。
- Sandbox 页面能看到 runtime tick、实体状态和事件日志。

当前状态：已实现。

## Phase 2：Renderer Core + Phaser Adapter

目标：Phaser 能作为 2D 渲染后端接入，但 gameplay 和 runtime 只依赖 RendererAdapter。

当前设计评估：第一版实现验证了 facade + adapter 和 app-owned lifecycle，但公共协议过窄。该问题已通过 Phase 2.1 修正。详细原因见 `docs/adr/0003-general-render-objects-and-input-decoupling.md`。

已实现：

- `@gamekit/renderer-core`：稳定 RendererAdapter facade，不依赖 Phaser、ECS 或 app。
- `@gamekit/renderer-phaser`：基于 `phaser@4.1.0` 的 adapter，公共出口不暴露 Phaser 类型。
- `@gamekit/test-utils`：renderer memory adapter 和 renderer conformance helper。
- `apps/sandbox`：Phaser canvas 挂载、render sync module、runtime/HUD/EventBus 面板。
- `docs/adr/0002-app-owned-renderer-lifecycle.md`：记录 Phase 2 renderer lifecycle 由 app 持有。

当前实现能力：

- 当前实现 API：`boot/destroy/getView/resize/createSprite/updateSprite/destroyObject/playAnimation/onInput`。
- 当前实现类型：`RenderObjectId`、`CreateSpriteConfig`、`UpdateSpritePatch`、`RendererInputEvent`。
- Phaser Scene 只负责 render object、animation、camera glue，不写 gameplay。
- Render sync system：从 ECS `Position` 等组件同步到 renderer object。
- Renderer lifecycle event：`renderer.booted/resized/object_created/object_destroyed/input/destroyed` 进入 EventBus。

完成定义：

- Sandbox 中实体由 Phaser adapter 渲染并随 runtime tick 移动。
- 业务代码和 game module 不直接 import `phaser`。
- renderer adapter lifecycle、object create/update/destroy、input bridge 有测试覆盖。
- `docs/architecture.md` 记录 renderer-core / renderer-phaser 依赖边界。

当前状态：已实现。`createSprite/updateSprite/onInput` 已被 Phase 2.1 替换，不作为后续长期扩展基础。

## Phase 2.1：Renderer Protocol Correction

目标：把 Phase 2 的 renderer facade 从 sprite API 修正为通用 render object protocol，并把 input 从 renderer-core 中解耦。

预期调整：

- `@gamekit/renderer-core` 改为通用对象接口。
- `CreateSpriteConfig` / `UpdateSpritePatch` 迁移为通用 `RenderObjectConfig` / `RenderObjectPatch`。
- Renderer adapter 提供 capability 查询或注册信息。
- `onInput` / `RendererInputEvent` 从 renderer-core 公共 API 移除或降级为 adapter 私有实验。
- Sandbox render metadata 从 `RenderSprite` 改为通用 `RenderObjectPresentation` 或 app-local equivalent。

完成定义：

- Sandbox 仍能渲染移动实体，但业务只创建通用 render object，不调用 sprite 专用 API。
- `@gamekit/renderer-core` 不包含 gameplay input event 类型。
- Renderer conformance tests 覆盖通用对象 create/update/destroy、未知类型错误、对象树/复合对象最小行为和 capability 查询。
- 后续 Asset/Data 阶段只基于通用 render object protocol。

当前状态：已实现。

## Phase 2.2：Input Core 设计预留

目标：把输入作为独立系统规划，不让 renderer adapter 承担 gameplay input。

预期新增：

- `@gamekit/input` 的设计文档和最小 facade。
- Raw device input、action mapping、input context、focus ownership 的边界说明。
- Renderer picking/hit-test 作为可选 capability，而不是 renderer-owned input event。

完成定义：

- `@gamekit/input` 的公共协议不依赖 Phaser、React 或浏览器专属类型。
- Sandbox 可以在不通过 renderer-core input API 的情况下观察最小输入动作。
- EventBus 只接收低频输入事实或 gameplay action，不接收每帧 pointer move。

## Phase 3：Asset System + DataPack 基础

目标：资源通过 AssetManifest 和 DataPack 声明、注册、校验，再由具体 adapter 加载。

预期新增：

- `@gamekit/asset`
- `@gamekit/asset-phaser`
- `@gamekit/data`
- DataPack validation tests
- Asset loading trace 基础结构

核心能力：

- `AssetDefinition`、`AssetManifest`、`AssetGroupDefinition`。
- `AssetManager`：register、lookup、load state、group state。
- Phaser asset loader adapter：image/spritesheet/atlas/audio/json/tilemap 的最小加载闭环。
- `DataPack`：assets、actors、abilities、effects、clues、tcaRules、terrain、roads、buildings、randomEvents 的结构入口。
- DataPack asset reference validation：数据引用 assetId，不直接引用 URL。

完成定义：

- Sandbox 可以通过 manifest 注册并加载至少一个 image/spritesheet asset。
- renderer-phaser 从 AssetManager/asset adapter 获取资源，而不是硬编码 URL。
- DataPack 校验能报告缺失 assetId、重复 id、未知资源类型。
- Asset load/failed/ready 事件进入 EventBus 或 trace buffer。

## Phase 4：TCA 规则系统

目标：Trigger / Condition / Action 数据驱动规则系统跑通，并从第一版开始可追踪。

预期新增：

- `@gamekit/tca`
- Rule conformance tests
- Trace fixtures
- Sandbox rule playground 示例

核心能力：

- `TcaRule`、`TriggerConfig`、`ConditionConfig`、`ActionConfig`。
- Trigger registry、Condition registry、Action registry。
- Event-based trigger indexing：按 event type 查规则，不全量扫描。
- Rule compile：condition/action handler 预绑定，value resolver 预编译。
- Value resolver：支持 `$event.*`、后续扩展 `$actor.*`、`$source.*`。
- Rule trace：记录 trigger、matched rule、condition pass/fail、action result、emitted events。
- `once/enabled/priority` 的最小语义。

完成定义：

- EventBus event 能触发 TCA rule。
- condition/action handler 可由 GameModule 注册。
- trace 能回答“哪个事件触发了哪些规则、哪些 condition 失败、执行了哪些 action”。
- TCA 不用于每帧高频逻辑；性能文档记录索引和预编译原则。

## Phase 5：GAS

目标：Actor、Attribute、Tag、Ability、Effect 基于 TCA 跑通，不重新发明一套规则系统。

预期新增：

- `@gamekit/gas`
- Actor/Ability/Effect definition tests
- Ability → TCA Rule compile tests
- Effect tick tests

核心能力：

- `ActorDefinition`、attributes、tags、presentation、abilities。
- `AbilityDefinition`：activation、conditions、effects/cues。
- `GameplayEffectDefinition`：duration、modifiers、periodic actions。
- Actor runtime state：attribute current/base、tags、active effects、cooldown。
- Ability activation 编译为 TCA rule。
- Effect tick 走 runtime/system，但复杂触发走 TCA/EventBus。
- Cue 只描述表现意图，不决定 gameplay 结果。

完成定义：

- Basic Attack Ability 能通过 event 激活并修改目标状态。
- Active effect 可以按 runtime tick 更新 duration/periodic action。
- GAS trace 能关联 ability/effect 与 TCA rule trace。
- 示例 actor 数据通过 DataPack 注册和校验。

## Phase 6：UI Core + React UI

目标：通用 UI 状态模型和 React 实现跑通，React 只处理 HUD/window/modal/devtools，不进入主循环。

预期新增：

- `@gamekit/ui-core`
- `@gamekit/react-ui`
- Tailwind CSS
- Zustand
- shadcn/ui 基础组件封装
- Base UI 局部 primitive

核心能力：

- `WindowDefinition`、WindowManager、ModalManager、ToastManager。
- Shortcut/Focus/Layout 的最小接口。
- GameShell、WindowLayer、ModalLayer、ToastLayer。
- ActorDetailWindow、EventLogWindow 作为首批窗口。
- UI action handler：如 `ui.open_window`、`ui.show_toast`，可由 TCA 调用。

完成定义：

- Sandbox 或示例 app 能打开/关闭窗口并显示 event log。
- React UI 只消费低频 selector/snapshot，不订阅每帧 ECS position。
- 游戏业务不直接依赖原始 shadcn/base primitive，统一从 `@gamekit/react-ui` 使用。

## Phase 7：Animation + Fx / Cue System

目标：表现动画和 gameplay 状态解耦，Cue System 负责播放表现，GSAP 只作为表现层 adapter。

预期新增：

- `@gamekit/animation`
- `@gamekit/fx`
- Cue playback tests
- GSAP adapter 或内部封装

核心能力：

- `Cue`：floating-text、screen-shake、sprite-flash、ui-pulse。
- Cue queue / Cue dispatcher。
- Renderer/UI cue target resolution。
- GSAP 驱动窗口动画、toast、floating text、camera shake 等表现。

完成定义：

- Gameplay action 只改状态或发 cue，不直接调用 GSAP。
- Cue playback 可在测试中记录，不依赖真实动画完成。
- Sandbox 能展示至少一种 renderer cue 和一种 UI cue。

## Phase 8：DevTools

目标：游戏可调试，尤其是数据驱动逻辑可解释。

预期新增：

- `@gamekit/devtools`
- DevTools trace model
- DevTools React panels
- System profiler 基础数据

核心能力：

- Event Log。
- TCA Rule Trace。
- Entity Inspector / Component Inspector。
- Actor Inspector / Ability Inspector / Effect Inspector。
- Asset Inspector。
- System Profiler。
- Renderer Object Count。

完成定义：

- 在 sandbox 或 demo 中能打开 DevTools 面板。
- 点击事件能看到关联 TCA trace、状态变更、后续 event。
- system profiler 至少记录 system id、调用次数、最近耗时。

## Phase 9：Save / Load / Migration

目标：长期状态可以序列化、恢复和迁移，为真实 demo 提供基础。

预期新增：

- `@gamekit/save`
- SaveGame schema
- migration registry
- save/load integration tests

核心能力：

- `SaveGame`：version、seed、time、world、gas、tca、ui、custom。
- RNG seed 保存与恢复。
- ECS state serialize/deserialize。
- GAS active effects/cooldown 保存。
- TCA once-rule state 保存。
- UI 可选状态保存。
- migration：从旧版本 save 升级到当前版本。

完成定义：

- 固定 seed + save/load 后，后续 tick 结果确定。
- 缺失/未知版本能给出明确错误。
- migration 至少有一个测试样例。

## Phase 10：Hero Road Demo

目标：用一个真实小 demo 验证整套架构，而不是只靠 sandbox。

预期新增：

- `apps/hero-road`
- Hero Road game modules
- Hero Road data packs
- Hero Road UI windows
- Hero Road renderer integration

核心玩法：

- 2D 俯视角格子地图。
- 道路铺设。
- 英雄自动沿道路前进。
- 地形、建筑、怪物巢穴触发随机事件。
- Hero Actor、Basic Attack Ability、Forest Ambush Event。
- Actor Detail Window、Event Log Window。

建议目录：

```txt
apps/hero-road/src/
  game/
    create-game.ts
    modules/
    data/
    ecs/
    ui/
    renderer/
```

完成定义：

- Demo 能从 DataPack 启动。
- 英雄能移动并触发至少一个 TCA random event。
- Basic Attack Ability 能通过 GAS 执行。
- Event Log / Actor Detail / TCA Trace 可查看。
- Save/Load 能恢复 demo 基础状态。

## Phase 11：Editor / Tooling

目标：为 DataPack、地图、规则、资源提供编辑和验证入口。

预期新增：

- `apps/editor`
- DataPack import/export
- Rule/Asset/Actor inspectors
- Editor IO adapter

完成定义：

- 能加载 demo DataPack。
- 能验证并展示 assets、actors、rules。
- 不把 editor-only 状态泄漏到 runtime core。

## Phase 12：Three.js / 3D Renderer Backlog

目标：验证 RendererAdapter 能支持未来 3D 后端。

预期新增：

- `@gamekit/renderer-three`
- 3D object minimal adapter
- renderer-core 兼容性复盘

完成定义：

- Three adapter 能 boot/destroy/create/update 基础对象。
- 发现 renderer-core 不足时，通过 ADR 记录协议调整原因。

## 横向要求

每个阶段都必须同步维护：

- `docs/architecture.md`：新增包、依赖方向、adapter 边界。
- `docs/implementation-principles.md`：新增实现原则或代码质量要求。
- `docs/best-practices.md`：新增实践、反模式、性能经验。
- `docs/adr/`：高影响技术决策。
- 测试：单元测试、契约测试、集成测试按风险补齐。

每个阶段提交前至少验证：

```bash
corepack pnpm test
corepack pnpm build
corepack pnpm lint
corepack pnpm format
```

涉及 world/renderer/TCA/asset 性能路径时，补 benchmark 或 profiler 数据。
