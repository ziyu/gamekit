import { GameError } from "@gamekit/core";
import {
  screenToWorld as fallbackScreenToWorld,
  worldToScreen as fallbackWorldToScreen,
  type CameraState2D,
  type PointLike
} from "@gamekit/camera-core";
import type { CreatePhaserCameraAdapterOptions, PhaserCameraAdapter } from "./types";

export function createPhaserCameraAdapter(
  options: CreatePhaserCameraAdapterOptions
): PhaserCameraAdapter {
  let state: CameraState2D | undefined;

  const requireState = (): CameraState2D => {
    if (!state) {
      throw new GameError("camera.not_applied", "Camera state has not been applied");
    }

    return state;
  };

  return {
    applyCameraState(nextState) {
      state = { ...nextState };
      const scrollX = nextState.x - nextState.viewport.width / (2 * nextState.zoom);
      const scrollY = nextState.y - nextState.viewport.height / (2 * nextState.zoom);

      options.driver.setZoom(nextState.zoom);
      options.driver.setScroll(scrollX, scrollY);
      options.driver.setRotation(nextState.rotation);
    },
    getState() {
      return state ? { ...state } : undefined;
    },
    worldToScreen(point: PointLike) {
      return fallbackWorldToScreen(requireState(), point);
    },
    screenToWorld(point: PointLike) {
      return fallbackScreenToWorld(requireState(), point);
    }
  };
}
