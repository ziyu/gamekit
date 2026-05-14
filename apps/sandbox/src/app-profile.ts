import { createAssetManager, type AssetLoaderAdapter, type AssetManager } from "@gamekit/asset";
import {
  createStandardAppProfile,
  type AppProfile,
  type StandardCameraActionBinding
} from "@gamekit/app-host";
import { createPhaserAssetAdapter } from "@gamekit/asset-phaser";
import type { CameraController } from "@gamekit/camera-core";
import { createPhaserCameraAdapter, type PhaserCameraAdapter } from "@gamekit/camera-phaser";
import type { DataRegistry } from "@gamekit/data";
import { createGasTcaDefinitions, createGasTraceStore, type GasRuntime } from "@gamekit/gas";
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
import { createTcaTraceStore, mergeTcaDefinitionSets } from "@gamekit/tca";
import { createSandboxCameraController, SANDBOX_CAMERA_PAN_STEP } from "./camera";
import {
  createSandboxDataRegistry,
  createSandboxRuntime,
  SANDBOX_RENDER_SIZE,
  type SandboxRuntime
} from "./game";
import { createSandboxTcaDefinitions } from "./game/modules/sandbox-tca-definitions";
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
  cameraController?: CameraController | undefined;
  cameraAdapter?: PhaserCameraAdapter | undefined;
  gasRuntime?: GasRuntime | undefined;
  sandbox?: SandboxRuntime | undefined;
  phaserRuntime?: PhaserRendererDriverRuntime | undefined;
};

export function createSandboxWebProfile(): AppProfile<SandboxAppContext> {
  const refs: {
    phaserRuntime?: PhaserRendererDriverRuntime;
    sandbox?: SandboxRuntime;
    gasRuntime?: GasRuntime;
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
  const tcaTraceStore = createTcaTraceStore({ limit: 20 });
  const gasTraceStore = createGasTraceStore({ limit: 30 });

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
      context.cameraController = camera;
      context.phaserRuntime = refs.phaserRuntime;
      context.gasRuntime = refs.gasRuntime;
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
        standardModules: {
          gas: {
            id: "sandbox.gas",
            traceStore: gasTraceStore,
            onRuntime({ context }, runtime) {
              refs.gasRuntime = runtime;
              context.gasRuntime = runtime;
            }
          },
          tca: {
            id: "sandbox.tca",
            definitions: mergeTcaDefinitionSets(
              createSandboxTcaDefinitions(),
              createGasTcaDefinitions({ runtime: () => refs.gasRuntime })
            ),
            traceStore: tcaTraceStore
          },
          camera: {
            id: "sandbox.camera",
            controller: camera,
            actions: sandboxCameraActions(),
            follow: {
              resolveTarget({ context }, targetEntity) {
                const entity = context.sandbox
                  ?.snapshot()
                  .entities.find((entry) => entry.id === targetEntity);
                return entity
                  ? {
                      x: (entity.x / 100) * SANDBOX_RENDER_SIZE.width,
                      y: (entity.y / 100) * SANDBOX_RENDER_SIZE.height
                    }
                  : undefined;
              }
            },
            smoothing: {
              enabled: true,
              stiffness: 12,
              positionEpsilon: 0.1,
              zoomEpsilon: 0.002
            },
            sync({ context }, camera, _action, state) {
              ensureCameraAdapter(context, refs.phaserRuntime)?.applyCameraState(state);
              updateCameraStatus(context.ui, camera.getState());
            }
          }
        },
        createRuntime({ context, state }, modules) {
          ensureCameraAdapter(context, refs.phaserRuntime)?.applyCameraState(camera.getState());
          updateCameraStatus(context.ui, camera.getState());
          const sandbox = createSandboxRuntime({
            renderer: requireStandardState(state.renderer, "renderer"),
            renderSize: SANDBOX_RENDER_SIZE,
            dataRegistry: requireStandardState(state.data, "data"),
            assetSummary: () => summarizeAssets(requireStandardState(state.assets, "assets")),
            modules,
            tcaTraceStore,
            gasTraceStore,
            gasRuntime: () => refs.gasRuntime
          });
          refs.sandbox = sandbox;
          context.sandbox = sandbox;
          return sandbox.runtime;
        }
      }
    }
  });
}

function sandboxCameraActions(): StandardCameraActionBinding[] {
  return [
    {
      actionId: "camera.pan_up",
      phases: ["pressed", "held"],
      pan: { y: -SANDBOX_CAMERA_PAN_STEP }
    },
    {
      actionId: "camera.pan_down",
      phases: ["pressed", "held"],
      pan: { y: SANDBOX_CAMERA_PAN_STEP }
    },
    {
      actionId: "camera.pan_left",
      phases: ["pressed", "held"],
      pan: { x: -SANDBOX_CAMERA_PAN_STEP }
    },
    {
      actionId: "camera.pan_right",
      phases: ["pressed", "held"],
      pan: { x: SANDBOX_CAMERA_PAN_STEP }
    },
    {
      actionId: "camera.zoom_in",
      phases: ["pressed", "scrolled"],
      zoom: { delta: 1, wheel: true, anchorFromInput: true }
    },
    {
      actionId: "camera.zoom_out",
      phases: ["pressed"],
      zoom: { delta: -1 }
    }
  ];
}

function ensureCameraAdapter(
  context: SandboxAppContext,
  runtime: PhaserRendererDriverRuntime | undefined
): PhaserCameraAdapter | undefined {
  context.cameraAdapter ??= createCameraAdapter(runtime);
  return context.cameraAdapter;
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

function summarizeAssets(manager: AssetManager) {
  const states = manager.states();
  return {
    assetsLoaded: states.filter((state) => state.status === "loaded").length,
    assetsFailed: states.filter((state) => state.status === "failed").length
  };
}

type SandboxRendererConfig = {
  width: number;
  height: number;
  debug?: boolean;
};
