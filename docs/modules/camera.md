# Camera 模块设计

## 定位

Camera 是 Runtime 能力，不是 Phaser 或 Three.js 私有对象。Input、Cue、TCA、Editor 和 UI 都可能控制 camera，因此需要独立抽象。

相关包：

- `@gamekit/camera-core`
- `@gamekit/camera-phaser`
- `@gamekit/camera-three`

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

## 与 Input 的关系

Camera 不直接监听 DOM 或 Phaser input。

```txt
input.action.camera.pan_up
→ CameraController.pan(0, -speed)

input.action.camera.zoom_in
→ CameraController.zoom(+1)
```

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
