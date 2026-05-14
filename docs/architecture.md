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

## 应用与验证面

`apps/sandbox` 是框架验证面，不是长期玩法仓库，也不是模块协议的来源。它可以实现一个有真实运行循环的小 demo，但 demo 专用的 entity role、production recipe、threat、objective 和 presentation 组件必须留在 Sandbox 内部。

Sandbox 的长期演示设计见 `docs/apps/sandbox.md`。阶段任务和当前实现状态仍放在 `docs/development-stages.md`。

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
tca → core / data / event-bus / game-runtime
gas → core / data / event-bus / game-runtime / tca / world
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

## 应用服务与游戏模块

GameKit 必须区分 App Service 和 Game Module，避免 App Host 变成玩法容器，也避免 GameRuntime 直接承担平台和 adapter 生命周期。

判断一个能力更像 App Service：

- 生命周期跟应用、窗口、平台、资源或外部句柄绑定。
- 主要负责 adapter boot/dispose、配置来源、平台差异、资源加载、全局诊断。
- 不需要每帧读取 world，也不应该直接知道具体玩法上下文。
- 可以通过 `services.xxx` 被多个 game module 或 UI/DevTools 读取。

判断一个能力更像 Game Module：

- 生命周期跟一次游戏会话或 GameRuntime 绑定。
- 需要注册 system、监听 EventBus、读写 world、读取 gameplay DataType 或参与 tick。
- 需要知道具体游戏上下文、规则、actor、camera rig、ability、save slot 等。
- 应通过 `GameModule` 安装，并在 GameRuntime dispose 时清理订阅和 runtime 状态。

App Host 可以提供“标准游戏模块”装配入口，但标准游戏模块仍属于 GameRuntime lifecycle。它们不进入 `services.xxx`，而是在 `game` service 创建 runtime 时作为 `GameModule[]` 注入。Camera action bridge、TCA runtime、未来 GAS runtime 都应优先走这个路径。

判断一个包更像 Adapter：

- 只把稳定 facade 映射到 Phaser、Three.js、DOM、Tauri、浏览器 API 等具体实现。
- 不承载玩法规则，不拥有跨模块生命周期。

判断一个包更像 Facade / Toolkit：

- 定义稳定协议、数据结构、controller、helper 或 conformance test。
- 可被 App Service 或 Game Module 使用，但自身不决定启动边界。

长期 package 归属：

| Package                                                                 | 归属                                         | 说明                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@gamekit/app-host`                                                     | App Service / composition                    | 应用组合、service lifecycle、config、diagnostics。                                   |
| `@gamekit/platform-core`                                                | App Service facade                           | 平台能力协议。                                                                       |
| `@gamekit/platform-web` / `@gamekit/platform-tauri`                     | App Service adapter                          | Web/Tauri 平台能力实现。                                                             |
| `@gamekit/data`                                                         | App Service                                  | 全局内容数据注册、校验、来源追踪。                                                   |
| `@gamekit/asset`                                                        | App Service                                  | 资源声明读取、加载状态、adapter 委托。                                               |
| `@gamekit/asset-phaser`                                                 | Adapter                                      | Phaser asset loader bridge。                                                         |
| `@gamekit/renderer-core`                                                | App Service facade                           | 渲染对象协议。                                                                       |
| `@gamekit/renderer-phaser` / `@gamekit/renderer-three`                  | App Service adapter                          | 渲染后端实现。                                                                       |
| `@gamekit/input-core`                                                   | App Service facade + gameplay bridge toolkit | raw input 归一化、action/context/scope；具体玩法绑定由 GameModule 使用。             |
| `@gamekit/input-dom` / `@gamekit/input-phaser` / `@gamekit/input-tauri` | App Service adapter                          | 输入来源接入。                                                                       |
| `@gamekit/camera-core`                                                  | Game Module toolkit                          | CameraController、CameraRig、camera system/action helper；不作为 App Host 标准服务。 |
| `@gamekit/camera-phaser` / `@gamekit/camera-three`                      | Adapter / bridge                             | 把 CameraState 同步到底层 renderer camera。                                          |
| `@gamekit/tca`                                                          | Game Module                                  | 数据驱动规则 runtime，通过标准 GameModule 无痛安装。                                 |
| `@gamekit/gas`                                                          | Game Module                                  | 通用 Actor/Ability/Effect runtime；热状态落在 World component，复用 TCA。            |
| `@gamekit/ui-core`                                                      | App/UI toolkit                               | UI 状态、window、focus 协议；gameplay 不直接依赖 React。                             |
| `@gamekit/react-ui`                                                     | App/UI adapter                               | React UI 实现。                                                                      |
| `@gamekit/save`                                                         | 混合：App Service + Game Module bridge       | 存储 adapter 和 profile 是应用服务；snapshot capture/restore 是游戏模块桥接。        |
| `@gamekit/devtools`                                                     | App Service / tooling                        | 观察 Host、Data、TCA、GAS、profiler，不进入 gameplay loop。                          |
| `@gamekit/world`                                                        | Runtime facade                               | ECS facade。                                                                         |
| `@gamekit/world-koota`                                                  | Runtime adapter                              | Koota adapter。                                                                      |
| `@gamekit/core` / `@gamekit/event-bus` / `@gamekit/game-runtime`        | Core Runtime                                 | 薄内核、事件、GameModule lifecycle。                                                 |

## 模块设计索引

- Core / Runtime：`docs/modules/core-runtime.md`
- App Host：`docs/modules/app-host.md`
- World：`docs/modules/world.md`
- Renderer：`docs/modules/renderer.md`
- Input：`docs/modules/input.md`
- Camera：`docs/modules/camera.md`
- Platform：`docs/modules/platform.md`
- Data：`docs/modules/data.md`
- Assets：`docs/modules/assets.md`
- TCA：`docs/modules/tca.md`
- GAS：`docs/modules/gas.md`
- UI：`docs/modules/ui.md`
- Save：`docs/modules/save.md`
- DevTools：`docs/modules/devtools.md`
- Hero Road：`docs/modules/hero-road.md`

## 关键边界

### App Host

App Host 是应用组合层，负责统一 service registry、lifecycle、config、platform profile 和 diagnostics。它可以组合 Platform、Data、Asset、Renderer、Input、GameRuntime、UI、DevTools 等应用服务，但不替代 gameplay module。

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

Camera 是 gameplay/session 能力，不是 App Host 标准服务，也不是 Phaser 或 Three.js 私有对象。Input、TCA、Cue、Editor 通过 CameraController 或 CameraRig 控制镜头；renderer camera adapter 只负责把 camera state 同步到底层渲染器。

详细设计见 `docs/modules/camera.md`。

### Platform

Platform 隔离 Web/Tauri/未来平台差异。文件、窗口、权限、路径、存储和系统能力都通过 platform-core。

详细设计见 `docs/modules/platform.md`。

### Data

Data 是全局内容数据层。DataPack 是真实内容交付单元，不是内容分类模型；每条数据通过 `type + id` 声明自己的 DataType，DataRegistry 负责按类型注册、校验、索引和追踪引用。DataType 可以由 GameKit 内置，也可以由游戏项目、插件、mod 或编辑器自定义。

GameKit 只要求进入 DataRegistry 的数据有 `type + id` 这类弱约束，不强制开发者采用框架预设的 hero、monster、building、quest 模板。游戏可以自由定义 `game.hero`、`game.monster`、`game.building` 等类型，并选择性引用 GAS、TCA、Renderer、Asset 等内置类型。

详细设计见 `docs/modules/data.md`。

### Assets

Assets 是资源加载运行时。AssetDefinition 作为 `asset.definition` DataType 进入 DataRegistry，也可以由编辑器、导入器或远程 manifest 提供。具体玩法数据通过 `AssetRef` 引用资源，资源定义不要求和引用它的数据位于同一个 DataPack。AssetManager 从 DataRegistry 或其他资源声明来源读取 AssetDefinition，并委托 adapter 加载。Asset adapter 不管理 gameplay definitions，DataRegistry 不管理加载状态。

详细设计见 `docs/modules/assets.md`。

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
