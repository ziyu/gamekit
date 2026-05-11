# 架构设计

## 核心方向

GameKit 采用“薄内核 + 成熟库 + 自定义协议 + Adapter”的架构。

核心包负责稳定协议：

- `@gamekit/core`：错误、结果、Registry、GameModule、RNG、Clock。
- `@gamekit/world`：ECS facade，只暴露 GameKit 自己的组件和世界接口。
- `@gamekit/world-koota`：Koota adapter，第三方 ECS 只存在于该包内部。
- `@gamekit/event-bus`：低频 gameplay/runtime event。
- `@gamekit/game-runtime`：模块安装、系统调度、生命周期。
- `@gamekit/renderer-core`：RendererAdapter facade，只描述通用渲染对象、对象树、变更 patch 和生命周期协议。
- `@gamekit/renderer-phaser`：Phaser adapter，Phaser 生命周期、Scene、Canvas、渲染对象类型映射只存在于该包内部。
- `@gamekit/input`：后续独立输入 facade，负责设备输入、动作映射、上下文、焦点和输入事件。

应用包负责验证真实使用方式：

- `apps/sandbox`：runtime/renderer 垂直切片，不承载长期玩法代码。

## 依赖方向

依赖只能从具体层指向抽象层：

```txt
apps/* → packages/*
adapter packages → facade packages
game-runtime → core / world / event-bus
world-koota → world / core / koota
renderer-phaser → renderer-core / core / phaser
renderer-core → event-bus(type only)
input → core / event-bus
world → 无第三方 ECS 依赖
```

禁止方向：

- `@gamekit/world` 依赖 Koota、bitecs 或任意具体 ECS。
- 业务模块直接导入 Koota、Phaser、GSAP 等第三方库。
- `@gamekit/renderer-core` 暴露 Phaser、DOM-heavy 实现或 ECS 类型。
- `@gamekit/renderer-core` 把公共协议限定为 sprite、mesh、particle 等任意单一渲染类型。
- Renderer adapter 直接拥有 gameplay input 语义、快捷键、动作映射或 UI 焦点。
- Runtime 包直接依赖具体游戏 app。

## Renderer 边界

Renderer 采用和 ECS 相同的 facade + adapter 结构：

- game module、runtime system 和 gameplay 数据只依赖 `@gamekit/renderer-core` 的 `RendererAdapter`。
- `@gamekit/renderer-phaser` 可以依赖 Phaser，但不得从公共出口导出 Phaser 类型。
- Renderer 公共协议以通用 render object 为中心，不以 `Sprite` API 为中心。
- Render object 类型由 adapter 声明和解释；core 只定义稳定 envelope、对象生命周期、父子关系和 capability 查询。
- 复合对象是一等能力，对象树可以混合不同 adapter-defined render type。
- Phase 2 的 renderer lifecycle 由 app 持有：app 提供 DOM container，boot adapter，再把 adapter 注入 render sync module。
- Runtime 不持有 DOM container，也不直接 boot renderer。后续如果改为 runtime-owned lifecycle，必须通过 ADR 记录。
- Asset 系统尚未接入前，adapter 可以提供内置 debug texture；真实资源加载从 Asset System 阶段开始收口。
- 详细决策背景和取舍见 `docs/adr/0003-general-render-objects-and-input-decoupling.md`。

## Input 边界

Input 是独立系统，不属于 renderer core。

- Renderer 可以暴露 view/canvas/container 或可选 picking/hit-test adapter，但不定义 gameplay input event。
- 设备输入、动作映射、输入上下文和 UI focus 都归 `@gamekit/input` 或 UI/Input adapter 设计。
- 未来 input 可以消费 renderer 的对象命中结果，但依赖方向应是 input adapter 使用 renderer capability，而不是 renderer 拥有 input module。

## 包内拆分约定

每个包的 `src/index.ts` 只作为公共出口，不承载主要实现。

推荐结构：

```txt
src/
  index.ts
  runtime/
  adapter/
  components/
  modules/
  types.ts
```

只有小型纯类型包可以保持更扁平，但仍应让实现文件有明确职责。
