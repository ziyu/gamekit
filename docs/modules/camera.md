# Camera 模块设计

## 定位

Camera 是游戏会话能力和 GameModule toolkit，不是 App Host 标准服务，也不是 Phaser 或 Three.js 私有对象。Input、Cue、TCA、Editor 和 UI 都可能控制 camera，因此需要独立抽象。

相关包：

- `@gamekit/camera-core`
- `@gamekit/camera-phaser`
- `@gamekit/camera-three`

包归属：

- `@gamekit/camera-core`：Game Module toolkit，提供 `CameraController`、camera state、rig、system/action helper。
- `@gamekit/camera-phaser` / `@gamekit/camera-three`：adapter / bridge，把 camera state 应用到底层 renderer camera。

Camera 通常需要 tick、world/entity、input action、TCA action 和 renderer sync，因此应该随 GameRuntime 通过 `createCameraModule(...)` 之类的标准模块 helper 启动。App Host 可以提供 renderer、input、data 等依赖，但不应该长期直接拥有 gameplay camera controller。

## 分层

```txt
CameraState
→ CameraController
→ CameraRig
→ Renderer Camera Adapter
→ Phaser Camera / Three.js Camera
```

Gameplay 和 UI 只知道 CameraController，不知道具体渲染器。

## CameraState

2D：

```ts
export type CameraState2D = {
  mode: CameraMode;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  bounds?: { x: number; y: number; width: number; height: number };
  targetEntity?: string | number;
};
```

3D：

```ts
export type CameraState3D = {
  mode: CameraMode;
  position: { x: number; y: number; z: number };
  target?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  fov?: number;
  zoom?: number;
  near?: number;
  far?: number;
  targetEntity?: string | number;
};
```

## CameraController

```ts
export type CameraController = {
  getState(): CameraState2D | CameraState3D;
  setState(state: Partial<CameraState2D | CameraState3D>): void;

  pan(dx: number, dy: number): void;
  zoom(delta: number, anchor?: { x: number; y: number }): void;
  follow(entity: string | number, options?: FollowOptions): void;
  stopFollow(): void;

  shake(config: CameraShakeConfig): void;
  flash(config: CameraFlashConfig): void;
  moveTo(target: CameraMoveTarget, options?: CameraMoveOptions): Promise<void>;

  worldToScreen(point: PointLike): PointLike;
  screenToWorld(point: PointLike): PointLike;
};
```

## CameraRig

CameraRig 是可复用镜头行为。

候选 rig：

- FreePanRig
- FollowEntityRig
- GridMapRig
- EditorRig
- CinematicRig
- OrbitRig

Hero Road 默认适合 `GridMapRig`：

- WASD / 拖拽移动。
- 滚轮缩放。
- 限制在地图 bounds 内。
- 可 follow hero。
- 可被事件临时 shake。

CameraRig 可能注册 system 或监听 EventBus，因此 rig 生命周期跟随 GameRuntime dispose，而不是 App Host dispose。

## 与 Input 的关系

Camera 不直接监听 DOM 或 Phaser input。

```txt
game-scoped input action: camera.pan_up
→ CameraController.pan(0, -speed)

game-scoped input action: camera.zoom_in
→ CameraController.zoom(+1)
```

Camera action 应由 Input 系统做 scope/context 过滤。常规游戏镜头控制只在 `game` scope 下生效；编辑器镜头、DevTools 镜头预览或 UI 快捷键可以定义自己的 action/context/scope 组合。

标准 camera module 应接收已经归一化的 action source，例如 `input.action` EventBus fact。Input 模块先完成 scope/context 过滤，camera module 再把语义 action 映射成 `CameraController.pan/zoom/follow` 等操作。安装时注册订阅，dispose 时清理订阅；renderer camera adapter 同步通过 profile/app 注入的 sync hook 完成。

CameraController 表示目标镜头状态；表现层镜头可以选择每 tick 向目标状态平滑插值。标准 camera module 应提供可配置 smoothing，让 renderer camera 不必随着每个 input event 离散跳动。Smoothing 仍属于 camera module / rig 行为，不属于 renderer adapter；renderer adapter 只负责应用传入的 camera state。

## 与 TCA/Cue 的关系

TCA action 可以发起镜头表现，但不依赖具体渲染器。

```json
{
  "type": "camera.shake",
  "args": {
    "duration": 0.25,
    "intensity": 0.6
  }
}
```

## Renderer Camera Adapter

Renderer adapter 负责把 camera state 应用到底层渲染器：

```ts
export type RendererCameraAdapter = {
  applyCameraState(state: CameraState2D | CameraState3D): void;
  worldToScreen(point: PointLike): PointLike;
  screenToWorld(point: PointLike): PointLike;
};
```

Phaser 映射到 `Scene.cameras.main`，Three.js 映射到 `PerspectiveCamera` / `OrthographicCamera` 和 controls。

Renderer camera adapter 本身是 bridge，不拥有 gameplay camera state。它可以由 camera module 调用，也可以由 editor/devtools module 调用。
