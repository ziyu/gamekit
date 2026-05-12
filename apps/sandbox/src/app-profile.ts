import { createAssetManager, type AssetLoaderAdapter, type AssetManager } from "@gamekit/asset";
import { createStandardAppProfile, type AppProfile } from "@gamekit/app-host";
import { createPhaserAssetAdapter } from "@gamekit/asset-phaser";
import type { CameraController } from "@gamekit/camera-core";
import { createPhaserCameraAdapter, type PhaserCameraAdapter } from "@gamekit/camera-phaser";
import type { DataRegistry } from "@gamekit/data";
import { createInputRouter, type InputRouter } from "@gamekit/input-core";
import { createDomInputAdapter } from "@gamekit/input-dom";
import type { PlatformRuntime } from "@gamekit/platform-core";
import { createWebPlatform } from "@gamekit/platform-web";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
import {
  createPhaserRenderer,
  type PhaserRendererAssetRuntime,
  type PhaserRendererDriverRuntime
} from "@gamekit/renderer-phaser";
import { createSandboxCameraController } from "./camera";
import {
  createSandboxDataRegistry,
  createSandboxRuntime,
  SANDBOX_RENDER_SIZE,
  type SandboxRuntime
} from "./game";
import {
  configureSandboxInputRouter,
  resolveSandboxInputScope,
  type SandboxInputScope
} from "./app-input";
import type { SandboxUiHandles } from "./ui/render-sandbox";
import { updateCameraStatus } from "./ui/render-sandbox";

export type SandboxAppContext = {
  ui: SandboxUiHandles;
  activeInputScope: SandboxInputScope;
  platform?: PlatformRuntime | undefined;
  dataRegistry?: DataRegistry | undefined;
  renderer?: RendererAdapter | undefined;
  assetManager?: AssetManager | undefined;
  inputRouter?: InputRouter | undefined;
  camera?: CameraController | undefined;
  cameraAdapter?: PhaserCameraAdapter | undefined;
  sandbox?: SandboxRuntime | undefined;
  phaserRuntime?: PhaserRendererDriverRuntime | undefined;
};

export function createSandboxWebProfile(): AppProfile<SandboxAppContext> {
  const refs: {
    phaserRuntime?: PhaserRendererDriverRuntime;
    sandbox?: SandboxRuntime;
  } = {};
  const platform = createWebPlatform({ appName: "GameKit Sandbox" });
  const dataRegistry = createSandboxDataRegistry();
  const renderer = createPhaserRenderer({
    onRuntime: (runtime) => {
      refs.phaserRuntime = runtime;
    }
  });
  const assetManager = createAssetManager({
    adapter: createLazyPhaserAssetAdapter({
      runtime: () => requirePhaserAssetRuntime(refs.phaserRuntime)
    }),
    onDiagnostic: (event) => {
      refs.sandbox?.runtime.eventBus.emit(event.type, event.payload, event.source);
    }
  });
  const camera = createSandboxCameraController(SANDBOX_RENDER_SIZE);
  const inputRouter = createInputRouter();

  return createStandardAppProfile({
    id: "web",
    adapters: {
      platform,
      renderer
    },
    expose({ context, state }) {
      context.platform = state.platform;
      context.dataRegistry = state.data;
      context.renderer = state.renderer;
      context.assetManager = state.assets;
      context.inputRouter = state.input;
      context.camera = state.camera;
      context.phaserRuntime = refs.phaserRuntime;
      context.sandbox = refs.sandbox;
    },
    services: {
      platform: {
        adapter: "platform"
      },
      data: {
        registry: dataRegistry
      },
      renderer: {
        adapter: "renderer",
        boot({ context, requireConfig }) {
          const rendererConfig = requireConfig<SandboxRendererConfig>();
          const boot: RendererBootContext = {
            container: context.ui.rendererRoot,
            width: rendererConfig.width,
            height: rendererConfig.height,
            onDiagnostic: (event) => {
              context.sandbox?.runtime.eventBus.emit(event.type, event.payload, event.source);
            }
          };

          return rendererConfig.debug === undefined
            ? boot
            : {
                ...boot,
                debug: rendererConfig.debug
              };
        }
      },
      assets: {
        manager: assetManager
      },
      camera: {
        controller: camera,
        apply({ context }, camera) {
          context.cameraAdapter = createCameraAdapter(refs.phaserRuntime);
          context.cameraAdapter?.applyCameraState(camera.getState());
          updateCameraStatus(context.ui, camera.getState());
        }
      },
      input: {
        router: inputRouter,
        configure({ context }, inputRouter) {
          configureSandboxInputRouter(context, inputRouter);
        },
        adapters({ context }, inputRouter) {
          return [
            createDomInputAdapter({
              target: window,
              scope: (event) => resolveSandboxInputScope(context, event),
              onInput: (event) => {
                inputRouter.handle(event);
              }
            })
          ];
        }
      },
      game: {
        createRuntime({ context, state }) {
          const sandbox = createSandboxRuntime({
            renderer: requireStandardState(state.renderer, "renderer"),
            renderSize: SANDBOX_RENDER_SIZE,
            dataRegistry: requireStandardState(state.data, "data")
          });
          refs.sandbox = sandbox;
          context.sandbox = sandbox;
          return sandbox.runtime;
        }
      }
    }
  });
}

function createLazyPhaserAssetAdapter(options: {
  runtime: () => PhaserRendererAssetRuntime;
}): AssetLoaderAdapter {
  return {
    id: "sandbox.phaser-assets",
    supports(asset) {
      return (
        asset.source.type === "url" && (asset.type === "image" || asset.type === "spritesheet")
      );
    },
    load(asset) {
      return createPhaserAssetAdapter({ runtime: options.runtime() }).load(asset);
    }
  };
}

function createCameraAdapter(
  runtime: PhaserRendererDriverRuntime | undefined
): PhaserCameraAdapter | undefined {
  if (!runtime?.camera) {
    return undefined;
  }

  return createPhaserCameraAdapter({
    driver: runtime.camera
  });
}

function requirePhaserAssetRuntime(
  runtime: PhaserRendererDriverRuntime | undefined
): PhaserRendererAssetRuntime {
  if (!runtime?.assets) {
    throw new Error("Phaser renderer asset runtime is unavailable");
  }

  return runtime.assets;
}

function requireStandardState<TValue>(value: TValue | undefined, name: string): TValue {
  if (value === undefined) {
    throw new Error(`Missing standard app service state: ${name}`);
  }

  return value;
}

type SandboxRendererConfig = {
  width: number;
  height: number;
  debug?: boolean;
};
