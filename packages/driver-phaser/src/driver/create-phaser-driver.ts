import { GameError } from "@gamekit/core";
import type { DriverCapabilities, DriverLifecyclePhase } from "@gamekit/driver-core";
import type { InputSourceAdapter } from "@gamekit/input-core";
import type { RendererBootContext } from "@gamekit/renderer-core";
import { createPhaserRenderer } from "@gamekit/renderer-phaser";
import { createPhaserDriverAssetLoader, type PhaserDriverAssetRuntime } from "./assets";
import { createPhaserDriverCameraAdapter, type PhaserDriverCameraAdapter } from "./camera";
import { createPhaserDriverInputSource } from "./input-source";
import { createPhaserDriverRuntime, type PhaserDriverRuntime } from "./runtime";
import type { PhaserDriverAdapters, PhaserDriverOptions, PhaserGameDriver } from "./types";

const DEFAULT_BACKGROUND_COLOR = "#171813";

export function createPhaserDriver(options: PhaserDriverOptions = {}): PhaserGameDriver {
  const driverId = options.id ?? "phaser";
  let phase: DriverLifecyclePhase = "registered";
  let runtime: PhaserDriverRuntime | undefined;

  const renderer = createPhaserRenderer({
    ...options.renderer,
    id: `${driverId}.renderer`,
    runtime: () => runtime?.renderer
  });
  const camera = createLazyCameraAdapter(driverId, () => requireCameraAdapter(driverId, runtime));

  const adapters: PhaserDriverAdapters = {
    renderer,
    assetLoader: createPhaserDriverAssetLoader({
      id: `${driverId}.asset-loader`,
      runtime: () => requireAssetRuntime(driverId, runtime)
    }),
    camera,
    createInputSource(inputOptions): InputSourceAdapter {
      return createPhaserDriverInputSource({
        ...inputOptions,
        source: inputOptions.source ?? `${driverId}.input`,
        runtime: () => requireInputRuntime(driverId, runtime)
      });
    }
  };

  return {
    id: driverId,
    kind: "phaser",
    async boot(ctx: RendererBootContext) {
      if (phase === "booted" || phase === "started") {
        return;
      }

      runtime = await createPhaserDriverRuntime(ctx, {
        backgroundColor: options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR
      });
      await renderer.boot(ctx);
      phase = "booted";
      camera.flush();
    },
    start() {
      phase = "started";
    },
    stop() {
      phase = "stopped";
    },
    resize(size) {
      renderer.resize(size.width, size.height);
    },
    dispose() {
      renderer.destroy();
      runtime?.destroy();
      runtime = undefined;
      phase = "disposed";
    },
    capabilities(): DriverCapabilities {
      return {
        renderer: true,
        assets: true,
        input: true,
        camera: true,
        scenes: true,
        particles: true,
        custom: {
          renderObjectTree: true,
          nativeHandles: true
        }
      };
    },
    adapters() {
      return adapters;
    },
    native() {
      return runtime;
    },
    snapshot() {
      return {
        id: driverId,
        kind: "phaser",
        phase,
        capabilities: this.capabilities(),
        adapters: ["renderer", "assetLoader", "camera", "inputSource"],
        details: {
          rendererId: renderer.id,
          runtimeReady: runtime !== undefined
        }
      };
    }
  };
}

function createLazyCameraAdapter(
  driverId: string,
  camera: () => PhaserDriverCameraAdapter
): PhaserDriverCameraAdapter & { flush(): void } {
  let adapter: PhaserDriverCameraAdapter | undefined;
  let pendingState: Parameters<PhaserDriverCameraAdapter["applyCameraState"]>[0] | undefined;
  const getAdapter = (): PhaserDriverCameraAdapter | undefined => {
    if (adapter) {
      return adapter;
    }
    try {
      adapter = camera();
      return adapter;
    } catch (error) {
      if (error instanceof GameError && error.code === "driver.phaser.camera_unavailable") {
        return undefined;
      }
      throw error;
    }
  };
  const requireAdapter = (): PhaserDriverCameraAdapter => {
    adapter ??= camera();
    return adapter;
  };

  return {
    applyCameraState(state) {
      pendingState = state;
      getAdapter()?.applyCameraState(state);
    },
    getState() {
      return getAdapter()?.getState() ?? (pendingState ? { ...pendingState } : undefined);
    },
    worldToScreen(point) {
      return requireAdapter().worldToScreen(point);
    },
    screenToWorld(point) {
      return requireAdapter().screenToWorld(point);
    },
    flush() {
      if (pendingState) {
        requireAdapter().applyCameraState(pendingState);
      }
    }
  };
}

function requireAssetRuntime(
  driverId: string,
  runtime: PhaserDriverRuntime | undefined
): PhaserDriverAssetRuntime {
  if (!runtime?.assets) {
    throw new GameError("driver.phaser.assets_unavailable", "Phaser asset runtime is unavailable", {
      driverId
    });
  }

  return runtime.assets;
}

function requireCameraAdapter(
  driverId: string,
  runtime: PhaserDriverRuntime | undefined
): PhaserDriverCameraAdapter {
  if (!runtime?.camera) {
    throw new GameError(
      "driver.phaser.camera_unavailable",
      "Phaser camera runtime is unavailable",
      {
        driverId
      }
    );
  }

  return createPhaserDriverCameraAdapter({ runtime: runtime.camera });
}

function requireInputRuntime(driverId: string, runtime: PhaserDriverRuntime | undefined) {
  if (!runtime?.input) {
    throw new GameError("driver.phaser.input_unavailable", "Phaser input runtime is unavailable", {
      driverId
    });
  }

  return runtime.input;
}
