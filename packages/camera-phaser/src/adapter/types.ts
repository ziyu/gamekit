import type { CameraState2D, PointLike } from "@gamekit/camera-core";

export type PhaserCameraDriver = {
  setScroll(x: number, y: number): void;
  setZoom(zoom: number): void;
  setRotation(rotation: number): void;
  screenToWorld?(point: PointLike): PointLike;
  worldToScreen?(point: PointLike): PointLike;
};

export type PhaserCameraAdapter = {
  applyCameraState(state: CameraState2D): void;
  getState(): CameraState2D | undefined;
  worldToScreen(point: PointLike): PointLike;
  screenToWorld(point: PointLike): PointLike;
};

export type CreatePhaserCameraAdapterOptions = {
  driver: PhaserCameraDriver;
};
