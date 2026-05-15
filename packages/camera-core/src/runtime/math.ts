import type {
  CameraBounds,
  CameraState2D,
  CameraViewport,
  CameraViewportRect,
  PointLike
} from "./types";

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  return clamp(zoom, minZoom, maxZoom);
}

export function clampCameraCenter(state: CameraState2D): Pick<CameraState2D, "x" | "y"> {
  if (!state.bounds) {
    return { x: state.x, y: state.y };
  }

  return clampCenterToBounds(state.x, state.y, state.viewport, state.zoom, state.bounds);
}

export function clampCenterToBounds(
  x: number,
  y: number,
  viewport: CameraViewport,
  zoom: number,
  bounds: CameraBounds
): PointLike {
  const halfWidth = viewport.width / (2 * zoom);
  const halfHeight = viewport.height / (2 * zoom);
  const minX = bounds.x + halfWidth;
  const maxX = bounds.x + bounds.width - halfWidth;
  const minY = bounds.y + halfHeight;
  const maxY = bounds.y + bounds.height - halfHeight;

  return {
    x: minX > maxX ? bounds.x + bounds.width / 2 : clamp(x, minX, maxX),
    y: minY > maxY ? bounds.y + bounds.height / 2 : clamp(y, minY, maxY)
  };
}

export function worldToScreen(state: CameraState2D, point: PointLike): PointLike {
  const dx = point.x - state.x;
  const dy = point.y - state.y;
  const cos = Math.cos(state.rotation);
  const sin = Math.sin(state.rotation);

  return {
    x: (dx * cos + dy * sin) * state.zoom + state.viewport.width / 2,
    y: (-dx * sin + dy * cos) * state.zoom + state.viewport.height / 2
  };
}

export function screenToWorld(state: CameraState2D, point: PointLike): PointLike {
  const dx = (point.x - state.viewport.width / 2) / state.zoom;
  const dy = (point.y - state.viewport.height / 2) / state.zoom;
  const cos = Math.cos(state.rotation);
  const sin = Math.sin(state.rotation);

  return {
    x: dx * cos - dy * sin + state.x,
    y: dx * sin + dy * cos + state.y
  };
}

export function clientToViewportPoint(
  point: PointLike,
  rect: CameraViewportRect,
  viewport: CameraViewport
): PointLike {
  return {
    x: ((point.x - rect.left) / rect.width) * viewport.width,
    y: ((point.y - rect.top) / rect.height) * viewport.height
  };
}

export function viewportToClientPoint(
  point: PointLike,
  rect: CameraViewportRect,
  viewport: CameraViewport
): PointLike {
  return {
    x: rect.left + (point.x / viewport.width) * rect.width,
    y: rect.top + (point.y / viewport.height) * rect.height
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
