# Driver 模块设计

## 定位

Driver 是外部引擎或外部运行时的一体化集成入口。它统一持有第三方库的 runtime、scene、resource manager、camera、input 和 plugin 句柄，并从同一个外部运行时中派生 GameKit 所需的多个 adapter。

Driver 解决的是“一个外部运行时横跨多个 GameKit 协议时如何统一集成”的问题。它不是 gameplay module，也不是单一协议 adapter。

相关包：

- `@gamekit/driver-core`
- `@gamekit/driver-phaser`
- `@gamekit/driver-three`

## 核心原则

- Core protocol 只定义稳定协议，不依赖具体第三方运行时。
- Adapter 只实现一个稳定协议，例如 renderer、input source、asset loader、camera sync。
- Driver 统一拥有一个第三方运行时，并暴露一组 adapter capability。
- 同一个第三方运行时只能由一个 Driver 实例负责生命周期。
- 业务代码、GameModule 和 core package 不直接 import Phaser、Three.js 等底层库。
- Driver 不能读取或修改 gameplay state；需要 world/tick/gameplay context 的能力仍属于 GameModule。

## Core Protocol、Adapter 与 Driver

三者职责不同：

```txt
Core Protocol
  定义 GameKit 稳定接口，例如 RendererAdapter、InputSource、AssetLoaderAdapter、RendererCameraAdapter。

Adapter
  把一个 Core Protocol 映射到某个具体后端能力。

Driver
  统一持有一个外部 runtime，并从中派生多个 Adapter。
```

判断一个集成是否应该成为 Driver：

- 第三方库拥有自己的 game / scene / renderer / loader / input / camera 生命周期。
- 多个 GameKit 协议都需要访问同一个底层 runtime。
- 多个 adapter 独立初始化会导致重复 scene、重复 loader、重复 input listener 或 camera 坐标不一致。
- 需要统一管理外部 runtime 的 boot、resize、pause、resume、dispose 和 diagnostic snapshot。

判断一个实现只需要 Adapter：

- 它只实现单个协议。
- 它不需要长期持有跨协议共享 runtime。
- 它可以被任意 Driver、App Service 或测试夹具注入。

## Driver Runtime

Driver 的长期形态：

```ts
export type GameDriver = {
  id: string;
  kind: string;

  boot(ctx: DriverBootContext): Promise<void>;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  resize?(size: DriverViewportSize): void;
  dispose(): Promise<void> | void;

  capabilities(): DriverCapabilities;
  adapters(): DriverAdapterMap;
  snapshot(): DriverSnapshot;
};
```

Driver lifecycle 归 App Host 或 app composition 层管理。GameRuntime 不直接拥有 Driver。

Driver 可以是 App Host service，因为它主要管理应用级外部句柄和平台/窗口生命周期；Driver 暴露出来的 camera controller、TCA、GAS 等 gameplay 行为不能因此变成 App Service。

## Driver Adapters

Driver 通过 `adapters()` 暴露已创建或可懒创建的 adapter：

```ts
export type DriverAdapterMap = {
  renderer?: RendererAdapter;
  inputSource?: InputSource;
  assetLoader?: AssetLoaderAdapter;
  camera?: RendererCameraAdapter;
  uiOverlay?: unknown;
  custom?: Record<string, unknown>;
};
```

约束：

- `adapters()` 返回的是 GameKit protocol adapter，不是 Phaser Scene、Three Camera 等原生对象。
- 原生对象只能通过受控 escape hatch 暴露给明确的 adapter / tooling 层。
- adapter 共享同一个 Driver 内部 runtime，不各自创建第三方 runtime。
- adapter 的错误、diagnostic 和 snapshot 应能关联到同一个 driver id。

## Driver Capability

Driver capability 描述当前外部 runtime 能提供什么，而不是描述 gameplay 功能。

```ts
export type DriverCapabilities = {
  renderer?: boolean;
  input?: boolean;
  assets?: boolean;
  camera?: boolean;
  audio?: boolean;
  particles?: boolean;
  physics?: boolean;
  scenes?: boolean;
  custom?: Record<string, boolean | string | number>;
};
```

Capability 用于 App Host、DevTools、Editor 和测试夹具判断当前 profile 是否支持某些 adapter 或表现能力。Gameplay rule 不应直接依赖 driver capability 做核心判定；玩法能力应通过 Data、TCA、GAS、World 和配置表达。

## Phaser Driver

Phaser 是典型 Driver，而不是一组互不相关的单协议 adapter。

Phaser Driver 统一持有：

- `Phaser.Game`
- active scene / scene registry
- texture manager
- loader
- input plugin
- camera manager
- tween / animation / particle capability

Phaser Driver 可以暴露：

- RendererAdapter：创建和更新 RenderObject。
- AssetLoaderAdapter：把 AssetDefinition 加载到 Phaser texture/cache。
- InputSource：把 Phaser input 归一化为 NormalizedInputEvent。
- RendererCameraAdapter：把 CameraState 同步到 Phaser camera。

边界：

- `@gamekit/driver-phaser` 是默认直接依赖 `phaser` 的包。
- Phaser asset、input、camera adapter 是 `@gamekit/driver-phaser` 的内部 capability，不作为长期独立 package 暴露。
- `@gamekit/renderer-phaser` 只把 RenderObject 协议映射到 Driver 提供的 Phaser Scene runtime，不创建 `Phaser.Game`，也不从 renderer 内部派生 input、camera 或 asset 能力。
- `@gamekit/renderer-core`、`@gamekit/input-core`、`@gamekit/camera-core`、`@gamekit/asset` 不依赖 Phaser。
- CameraController 和 CameraRig 仍属于 GameModule toolkit；Phaser Driver 只提供 camera sync adapter。

## Three.js Driver

Three.js 也应该按 Driver 集成，而不是让 renderer、asset、input、camera 各自持有 Three 相关句柄。

Three Driver 统一持有：

- WebGL renderer
- scene
- camera objects
- loader manager
- raycaster / pointer picking bridge
- optional controls / post-processing / effect composer

Three Driver 可以暴露：

- RendererAdapter：创建 mesh、model、light、group、particle 等 RenderObject。
- AssetLoaderAdapter：加载 texture、GLB/glTF、material、environment map。
- InputSource：把 canvas pointer / raycast 结果归一化为 input event 或 picking fact。
- RendererCameraAdapter：同步 2D/3D CameraState 到 Three camera。

## 与 App Host 的关系

App Host 负责创建、注册和编排 Driver service。

推荐组合方向：

```ts
const driver = createPhaserDriver(phaserOptions);

const host = createConfiguredAppHost({
  profile: createStandardAppProfile({
    drivers: { drivers: [driver], boot },
    renderer: { driver: "phaser" },
    input: { router, driverSources: [{ driver: "phaser" }] },
    assets: { driver: "phaser" }
  })
});
```

App Host 只知道 Driver 的 GameKit 协议和 lifecycle，不理解 Phaser / Three 原生类型。Profile 可以选择某个 driver capability 作为标准 renderer、asset loader、input source 或 camera sync 来源。

多个 Driver 可以同时存在，例如：

- Phaser 负责 2D game stage。
- React UI 负责 DOM overlay。
- Three 负责 isolated 3D preview panel。
- Headless memory driver 负责测试。

如果多个 Driver 同时存在，App Host profile 必须显式选择每个标准服务使用哪个 driver capability，避免隐式抢占。

## 与 GameRuntime 的关系

GameRuntime 不直接拥有 Driver。

GameModule 可以通过 app/profile 注入的 core adapter 使用 Driver 暴露出的能力：

```txt
CameraModule
  → CameraController
  → RendererCameraAdapter from Driver

RenderSyncModule
  → RendererAdapter from Driver

Asset preload service
  → AssetLoaderAdapter from Driver
```

GameModule 不应该拿到 Phaser Scene 或 Three Scene 后直接写 gameplay 行为。需要原生能力时，应先判断它是不是表现层 escape hatch、adapter extension 或 DevTools tooling。

## Diagnostics

Driver snapshot 应能说明：

- driver id / kind / lifecycle phase。
- active external runtime 状态。
- exposed adapter capabilities。
- viewport size / render surface 状态。
- loaded asset / texture / cache 摘要。
- input source 状态。
- camera sync 状态。
- recent driver diagnostics。

Driver diagnostic 是低频应用事实，进入 App Host diagnostics 或 DevTools；高频 per-frame render patch、raw input 和底层对象状态不进入 EventBus。

## 反模式

- asset、camera、input 各自作为独立 Phaser package 创建或持有独立 Phaser runtime。
- Camera GameModule 直接 import Phaser 并修改 `Scene.cameras.main`。
- AssetManager 直接依赖 Phaser loader。
- RendererAdapter 重新定义 input event 或 gameplay command。
- App Host 根据包名猜测某个 adapter 属于哪个底层 runtime。
- 业务数据里保存 Phaser Texture、Three Mesh 或 native object reference。

## 最佳实践

### 模块集成

- 只要第三方库同时影响 renderer、asset、input、camera 或 scene lifecycle，就优先建 Driver，而不是散落多个独立 adapter。
- Driver 是外部 runtime owner：负责 boot、resize、pause/resume、dispose、diagnostics 和 capability 暴露；Adapter 是协议映射者，不重新创建 runtime。
- Profile 必须显式选择标准服务使用哪个 driver capability。多 Driver 并存时不要靠默认顺序或包名猜测。
- 新增 Three、Pixi、Godot bridge 等 Driver 时，先复用现有 Renderer/Input/Asset/Camera 协议，不够用再通过 ADR 调整协议。
- 测试 Driver 时优先使用 fake runtime/driver harness 验证 lifecycle 和 capability mapping，浏览器或真实 canvas 只用于少量端到端验证。

### 模块使用

- Driver public API 不导出 Phaser、Three 等原生类型给 gameplay。确需逃生口时，使用受控 handle，并标记为 presentation/tooling path。
- Driver diagnostics 只发低频事实，例如 runtime phase、capability、surface size、asset cache summary；不要把每帧 render patch 或 raw input 打进 diagnostics。
- GameModule 和业务代码只消费 Driver 派生的 RendererAdapter、AssetLoaderAdapter、InputSource 或 camera sync adapter，不直接拿 Phaser Scene 或 Three Scene 写玩法。
