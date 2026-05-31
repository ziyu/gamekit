export type CameraMode = "free" | "follow";

export type PointLike = {
  x: number;
  y: number;
};

export type CameraBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CameraViewport = {
  width: number;
  height: number;
};

export type CameraViewportRect = CameraViewport & {
  left: number;
  top: number;
};

export type CameraState2D = {
  mode: CameraMode;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  viewport: CameraViewport;
  minZoom: number;
  maxZoom: number;
  bounds?: CameraBounds;
  targetEntity?: string | number;
};

export type CameraShakeImpulse = {
  id?: string | undefined;
  amplitude: number;
  durationMs: number;
  frequency?: number | undefined;
  elapsedMs?: number | undefined;
};

export type CreateCameraControllerOptions = {
  state?: Partial<CameraState2D>;
  viewport: CameraViewport;
};

export type CameraController = {
  getState(): CameraState2D;
  setState(patch: Partial<CameraState2D>): void;
  pan(dx: number, dy: number): void;
  zoom(delta: number, anchor?: PointLike): void;
  follow(entity: string | number): void;
  stopFollow(): void;
  shake(impulse: CameraShakeImpulse): void;
  update(deltaMs: number): CameraState2D;
  getDisplayState(): CameraState2D;
  worldToScreen(point: PointLike): PointLike;
  screenToWorld(point: PointLike): PointLike;
};
