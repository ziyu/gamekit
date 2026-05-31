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

type ActiveCameraShakeImpulse = {
  id: string;
  amplitude: number;
  durationMs: number;
  frequency: number;
  elapsedMs: number;
};

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
  let displayState = state;
  let shakeSequence = 0;
  const impulses: ActiveCameraShakeImpulse[] = [];

  const setState = (patch: Partial<CameraState2D>): void => {
    state = normalizeState({
      ...state,
      ...patch
    });
    displayState = applyShake(state, impulses);
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
      displayState = applyShake(state, impulses);
    },
    shake(impulse) {
      if (impulse.amplitude <= 0 || impulse.durationMs <= 0) {
        return;
      }
      shakeSequence += 1;
      impulses.push({
        id: impulse.id ?? `camera.shake.${shakeSequence}`,
        amplitude: impulse.amplitude,
        durationMs: impulse.durationMs,
        frequency: impulse.frequency ?? 28,
        elapsedMs: impulse.elapsedMs ?? 0
      });
      displayState = applyShake(state, impulses);
    },
    update(deltaMs) {
      const nextImpulses = [];
      for (const impulse of impulses) {
        const elapsedMs = impulse.elapsedMs + Math.max(0, deltaMs);
        if (elapsedMs < impulse.durationMs) {
          nextImpulses.push({ ...impulse, elapsedMs });
        }
      }
      impulses.length = 0;
      impulses.push(...nextImpulses);
      displayState = applyShake(state, impulses);
      return { ...displayState };
    },
    getDisplayState() {
      return { ...displayState };
    },
    worldToScreen(point: PointLike) {
      return worldToScreen(displayState, point);
    },
    screenToWorld(point: PointLike) {
      return screenToWorld(displayState, point);
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

function applyShake(state: CameraState2D, impulses: ActiveCameraShakeImpulse[]): CameraState2D {
  if (impulses.length === 0) {
    return { ...state };
  }

  let x = state.x;
  let y = state.y;
  for (const impulse of impulses) {
    const progress = Math.min(1, impulse.elapsedMs / impulse.durationMs);
    const amplitude = impulse.amplitude * (1 - progress);
    const phase = impulse.elapsedMs * 0.001 * impulse.frequency * Math.PI * 2;
    x += Math.cos(phase) * amplitude;
    y += Math.sin(phase * 1.37) * amplitude;
  }

  return {
    ...state,
    x,
    y
  };
}
