# 阶段路线图

## Phase 1：Runtime 垂直切片

目标：证明 monorepo、薄内核、world facade、Koota adapter、EventBus、GameRuntime、Sandbox 可以协同工作。

完成定义：

- `corepack pnpm test` 通过。
- `corepack pnpm build` 通过。
- `corepack pnpm lint` 通过。
- `corepack pnpm bench:world` 可运行。
- Sandbox 页面能看到 runtime tick、实体状态和事件日志。

当前状态：已实现。

## Phase 2：Renderer Core + Phaser Adapter

目标：引入渲染抽象和 Phaser 2D adapter，但不让 Phaser 泄漏到 gameplay。

预期新增：

- `@gamekit/renderer-core`
- `@gamekit/renderer-phaser`
- Sandbox 中的 renderer 接入示例
- renderer object conformance tests

## Phase 3：Asset System

目标：资源通过 AssetManifest 声明和加载，具体加载逻辑在 adapter 内。

预期新增：

- `@gamekit/asset`
- `@gamekit/asset-phaser`
- manifest validation
- asset loading trace

## Phase 4：TCA

目标：数据驱动规则系统跑通，并从 MVP 起提供 trace。

预期新增：

- trigger/condition/action registry
- event trigger indexing
- value resolver
- rule trace

## Phase 5：GAS

目标：Actor、Ability、Effect 基于 TCA 跑通。

预期新增：

- actor/ability/effect definitions
- ability to TCA rule compile
- active effect tick
- GAS inspector 数据源
