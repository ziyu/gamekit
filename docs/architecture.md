# 架构设计

## 核心方向

GameKit 采用“薄内核 + 成熟库 + 自定义协议 + Adapter”的架构。

成熟库负责底层能力，GameKit 负责稳定协议、组合边界、数据驱动和可解释性。

## 总体分层

```txt
Game App
  ↓
App Host / Service Lifecycle
  ↓
Game Modules / DataPack
  ↓
Gameplay Framework
  ↓
Core Runtime
  ↓
Adapters / Libraries
```

## 包结构

当前和规划包拆分如下：

```txt
packages/
  app-host/

  core/
  event-bus/
  game-runtime/
  world/
  world-koota/

  renderer-core/
  renderer-phaser/
  renderer-three/

  input-core/
  input-dom/
  input-phaser/
  input-tauri/

  camera-core/
  camera-phaser/
  camera-three/

  platform-core/
  platform-web/
  platform-tauri/

  data/
  asset/
  asset-phaser/
  tca/
  gas/
  ui-core/
  react-ui/
  save/
  devtools/
  test-utils/
```

说明：

- `@gamekit/fx` 不作为独立业务包规划；Effect 可作为 Asset/Data/Save/Platform/Editor 等基础设施包内部实现选择。
- `@gamekit/animation` 不作为早期独立包规划；动画主要归入 RenderObject、Renderer Adapter、Cue/Presentation、UI、Camera。
- 模块长期设计见 `docs/modules/`。

## 依赖方向

依赖只能从具体层指向抽象层：

```txt
apps/* → packages/*
app-host → core / event-bus / game-runtime / platform-core / data / asset / renderer-core / input-core / camera-core
adapter packages → facade packages
game-runtime → core / world / event-bus
world-koota → world / core / koota
renderer-phaser → renderer-core / core / phaser
renderer-three → renderer-core / core / three
input-dom/input-phaser/input-tauri → input-core
camera-phaser/camera-three → camera-core
platform-web/platform-tauri → platform-core
asset → data / core
asset-phaser → asset / renderer-phaser
react-ui → ui-core
```

禁止方向：

- `@gamekit/world` 依赖 Koota、bitecs 或任意具体 ECS。
- `@gamekit/renderer-core` 依赖 Phaser、Three.js、DOM-heavy 实现或 ECS。
- `@gamekit/input-core` 依赖 DOM、Phaser、Tauri。
- `@gamekit/camera-core` 依赖 Phaser、Three.js。
- `@gamekit/platform-core` 依赖 Tauri 或浏览器私有 API。
- 业务模块直接导入 Koota、Phaser、Three.js、GSAP、Tauri、shadcn/ui 等第三方库。
- Runtime 包直接依赖具体游戏 app。
- GameRuntime 直接拥有 renderer、input、camera、platform、asset、data 等应用级服务。

## 模块设计索引

- Core / Runtime：`docs/modules/core-runtime.md`
- App Host：`docs/modules/app-host.md`
- World：`docs/modules/world.md`
- Renderer：`docs/modules/renderer.md`
- Input：`docs/modules/input.md`
- Camera：`docs/modules/camera.md`
- Platform：`docs/modules/platform.md`
- Asset / Data：`docs/modules/asset-data.md`
- TCA：`docs/modules/tca.md`
- GAS：`docs/modules/gas.md`
- UI：`docs/modules/ui.md`
- Save：`docs/modules/save.md`
- DevTools：`docs/modules/devtools.md`
- Hero Road：`docs/modules/hero-road.md`

## 关键边界

### App Host

App Host 是应用组合层，负责统一 service registry、lifecycle、config、platform profile 和 diagnostics。它可以组合 Platform、Data、Asset、Renderer、Input、Camera、GameRuntime、UI、DevTools，但不替代这些模块本身。

普通 app 应优先通过 `GameAppDefinition + AppProfile` 启动 Host。Definition 描述 app 需要哪些标准服务，Profile 提供统一 adapter/对象参数包和少量 service 参数；标准 service binding 由 App Host 内部创建。底层 `createAppHost({ services })` 保留给测试、工具和少数需要手动装配的高级场景。

GameRuntime 继续保持薄内核，不直接拥有应用级 adapter 和服务。详细设计见 `docs/modules/app-host.md`。

### Renderer

Renderer 公共协议以通用 render object 为中心，不以 Sprite API 为中心。Render type 由 adapter 声明和解释，复合对象是一等能力。

详细设计见 `docs/modules/renderer.md`，决策背景见 `docs/adr/0003-general-render-objects-and-input-decoupling.md`。

### Input

Input 是独立系统，负责 raw input、action mapping、context、focus 和 command routing。Renderer 可以提供 view/picking/hit-test capability，但不拥有 gameplay input 语义。

Input 使用 scope 表达输入事件当前所属交互域，例如 `game`、`ui`、`editor`、`text-input` 或 `devtools`。Action 和 Context 都可以声明允许的 scope，避免 gameplay/camera 快捷键在非游戏窗口误触发。

详细设计见 `docs/modules/input.md`。

### Camera

Camera 是 Runtime 能力，不是 Phaser 或 Three.js 私有对象。Input、TCA、Cue、Editor 都通过 CameraController 控制镜头。

详细设计见 `docs/modules/camera.md`。

### Platform

Platform 隔离 Web/Tauri/未来平台差异。文件、窗口、权限、路径、存储和系统能力都通过 platform-core。

详细设计见 `docs/modules/platform.md`。

### Data / Asset

Data 是全局内容数据层，Asset 是资源加载运行时。AssetDefinition 作为 DataKind 进入 DataRegistry，AssetManager 从 DataRegistry 读取资源声明并委托 adapter 加载。Asset adapter 不管理 gameplay definitions，DataRegistry 不管理加载状态。

详细设计见 `docs/modules/asset-data.md`。

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
