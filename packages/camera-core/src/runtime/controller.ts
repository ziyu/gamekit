import { clampCameraCenter, clampZoom, screenToWorld, worldToScreen } from "./math";
import type {
  CameraController,
  CameraState2D,
  CreateCameraControllerOptions,
  PointLike
} from "./types";

const DEFAULT_MIN_ZOOM = 0.25;
const DEFAULT_MAX_ZOOM = 4;
const DEFAULT_ZOOM_FACTOR = 1.2;

export function createCameraController(options: CreateCameraControllerOptions): CameraController {
  let state = normalizeState({
    mode: "free",
    x: options.viewport.width / 2,
    y: options.viewport.height / 2,
    zoom: 1,
    rotation: 0,
    viewport: options.viewport,
    minZoom: DEFAULT_MIN_ZOOM,
    maxZoom: DEFAULT_MAX_ZOOM,
    ...options.state
  });

  const setState = (patch: Partial<CameraState2D>): void => {
    state = normalizeState({
      ...state,
      ...patch
    });
  };

  return {
    getState() {
      return { ...state };
    },
    setState,
    pan(dx, dy) {
      setState({
        x: state.x + dx / state.zoom,
        y: state.y + dy / state.zoom,
        mode: state.mode === "follow" ? "free" : state.mode
      });
    },
    zoom(delta, anchor) {
      const beforeAnchorWorld = anchor ? screenToWorld(state, anchor) : undefined;
      const nextZoom = clampZoom(
        state.zoom * Math.pow(DEFAULT_ZOOM_FACTOR, delta),
        state.minZoom,
        state.maxZoom
      );

      if (!anchor || !beforeAnchorWorld || nextZoom === state.zoom) {
        setState({ zoom: nextZoom });
        return;
      }

      const nextX = beforeAnchorWorld.x - (anchor.x - state.viewport.width / 2) / nextZoom;
      const nextY = beforeAnchorWorld.y - (anchor.y - state.viewport.height / 2) / nextZoom;
      setState({
        x: nextX,
        y: nextY,
        zoom: nextZoom
      });
    },
    follow(entity) {
      setState({
        mode: "follow",
        targetEntity: entity
      });
    },
    stopFollow() {
      const { targetEntity: _targetEntity, ...next } = state;
      state = {
        ...next,
        mode: "free"
      };
    },
    worldToScreen(point: PointLike) {
      return worldToScreen(state, point);
    },
    screenToWorld(point: PointLike) {
      return screenToWorld(state, point);
    }
  };
}

function normalizeState(state: CameraState2D): CameraState2D {
  const zoom = clampZoom(state.zoom, state.minZoom, state.maxZoom);
  const clampedCenter = clampCameraCenter({
    ...state,
    zoom
  });

  return {
    ...state,
    ...clampedCenter,
    zoom
  };
}
