import { createStandardAppProfile, type AppProfile } from "@gamekit/app-host";
import type { AssetDiagnosticEvent, AssetManager } from "@gamekit/asset";
import { createCameraController, type CameraController } from "@gamekit/camera-core";
import type { DataRegistry } from "@gamekit/data";
import type { DevToolsRuntime } from "@gamekit/devtools";
import { createPhaserDriver } from "@gamekit/driver-phaser";
import { createInputRouter, type InputRouter } from "@gamekit/input-core";
import { createDomInputAdapter } from "@gamekit/input-dom";
import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";
import { createMultiplayerRuntime, type MultiplayerRuntime } from "@gamekit/multiplayer-core";
import type { PhysicsBackendAdapter } from "@gamekit/physics-core";
import { createWebPlatform } from "@gamekit/platform-web";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
import { applyPhaserRenderTargetState } from "@gamekit/renderer-phaser";
import { createPlatformStorageSaveStore, type SaveManager } from "@gamekit/save";
import type { UiFocusScope, UiRuntime } from "@gamekit/ui-core";
import { createKootaWorld } from "@gamekit/world-koota";
import { createOutpostDataRegistry } from "../content";
import {
  configureOutpostInputRouter,
  createOutpostPreviewRuntime,
  OUTPOST_VIEWPORT,
  type OutpostPreviewRuntime
} from "../gameplay";
import { outpostProfileDefinition } from "./definitions";

const PHASER_DRIVER_ID = "outpost.phaser";

export type OutpostBrowserUiHandles = {
  rendererRoot: HTMLElement;
};

export type OutpostBrowserContext = {
  ui: OutpostBrowserUiHandles;
  uiRuntime: UiRuntime;
  physicsBackend: PhysicsBackendAdapter;
  inputBlocked: boolean;
  assetDiagnostics: AssetDiagnosticEvent[];
  platform?: ReturnType<typeof createWebPlatform> | undefined;
  dataRegistry?: DataRegistry | undefined;
  assets?: AssetManager | undefined;
  renderer?: RendererAdapter | undefined;
  inputRouter?: InputRouter | undefined;
  camera?: CameraController | undefined;
  multiplayer?: MultiplayerRuntime | undefined;
  saveManager?: SaveManager | undefined;
  devtools?: DevToolsRuntime | undefined;
  preview?: OutpostPreviewRuntime | undefined;
};

export function createOutpostBrowserProfile(
  context: OutpostBrowserContext
): AppProfile<OutpostBrowserContext> {
  const profileDefinition = outpostProfileDefinition("browser-web");
  const platform = createWebPlatform({ appName: "Outpost Siege" });
  const dataRegistry = createOutpostDataRegistry();
  const phaserDriver = createPhaserDriver({
    id: PHASER_DRIVER_ID,
    backgroundColor: "#07110f",
    render: {
      pixelRatio: resolveOutpostPixelRatio(),
      antialias: true,
      antialiasGL: true,
      roundPixels: true
    }
  });
  const inputRouter = createInputRouter();
  const camera = createCameraController({
    viewport: OUTPOST_VIEWPORT,
    state: {
      x: 900,
      y: 500,
      zoom: 1,
      minZoom: 0.72,
      maxZoom: 1.35
    }
  });
  const multiplayer = createMultiplayerRuntime({
    id: "outpost.browser.preview",
    backend: createMemoryMultiplayerBackend({ id: "outpost.memory-preview" }),
    connectContext: {
      localPeer: {
        id: "outpost.preview.peer.local",
        displayName: "Ranger 01",
        role: "host",
        playerId: "outpost.preview.player"
      }
    }
  });

  return createStandardAppProfile({
    id: profileDefinition.id,
    adapters: { platform },
    expose({ context: exposed, state }) {
      exposed.platform = state.platform as ReturnType<typeof createWebPlatform>;
      exposed.dataRegistry = state.data;
      exposed.assets = state.assets;
      exposed.renderer = state.renderer;
      exposed.inputRouter = state.input;
      exposed.camera = camera;
      exposed.multiplayer = state.multiplayer;
      exposed.saveManager = state.save;
      exposed.devtools = state.devtools;
      if (state.ui) {
        exposed.uiRuntime = state.ui;
      }
    },
    services: {
      platform: { adapter: "platform" },
      drivers: {
        drivers: [phaserDriver],
        boot({ context: activeContext }, _driver) {
          return createRendererBootContext(activeContext);
        }
      },
      data: { registry: dataRegistry },
      renderer: { driver: PHASER_DRIVER_ID },
      assets: {
        driver: PHASER_DRIVER_ID,
        preloadGroups: () => [...profileDefinition.preloadGroups],
        onDiagnostic(event) {
          contextAssetDiagnostic(context, event);
        }
      },
      input: {
        router: inputRouter,
        configure(_ctx, router) {
          configureOutpostInputRouter(router);
        },
        adapters({ context: activeContext }, router) {
          return [
            createDomInputAdapter({
              target: window,
              capture: true,
              source: "outpost.dom.keyboard",
              scope: () => resolveKeyboardScope(activeContext),
              eventFilter: (event) => event.type === "keydown" || event.type === "keyup",
              onInput(event) {
                router.handle(event);
              }
            })
          ];
        },
        driverSources: [
          {
            driver: PHASER_DRIVER_ID,
            source: "outpost.phaser.pointer",
            devices: ["mouse", "touch", "pen"],
            scope: "game"
          }
        ]
      },
      multiplayer: { runtime: multiplayer },
      ui: {
        runtime({ context: activeContext }) {
          return activeContext.uiRuntime;
        },
        panels() {
          return [{ id: "outpost.hud", title: "Field HUD", kind: "hud", tags: ["outpost"] }];
        },
        openPanels: () => ["outpost.hud"]
      },
      game: {
        createRuntime({ context: activeContext, state }) {
          const preview = createOutpostPreviewRuntime({
            dataRegistry: requireState(state.data, "data"),
            world: createKootaWorld(),
            physicsBackend: activeContext.physicsBackend,
            renderer: requireState(state.renderer, "renderer"),
            applyRenderTargetState: applyPhaserRenderTargetState,
            camera,
            cameraAdapter: phaserDriver.adapters().camera
          });
          activeContext.preview = preview;
          return preview.runtime;
        }
      },
      save: {
        store: createPlatformStorageSaveStore({
          storage: platform.services.storage,
          prefix: "outpost-siege.preview.save"
        }),
        formatVersion: "1.0.0",
        gameVersion: "0.1.0",
        contributorPolicy: {
          excludeScopes: ["presentation", "debug", "cache", "ui"]
        }
      },
      devtools: {
        preset: "standard",
        options: {
          traceLimit: 500,
          diagnosticLimit: 200,
          profilerBudgetMs: 8
        },
        ui: { pins: false },
        dataSources({ context: activeContext }) {
          return [
            {
              id: "outpost.preview",
              label: "Outpost Local Preview",
              kind: "world",
              snapshot() {
                return activeContext.preview?.snapshot() ?? { status: "booting" };
              }
            },
            {
              id: "outpost.camera",
              label: "Outpost Camera",
              kind: "camera",
              snapshot() {
                return {
                  state: camera.getDisplayState(),
                  driver: phaserDriver.snapshot()
                };
              }
            },
            {
              id: "outpost.physics",
              label: "Outpost Physics Presentation",
              kind: "physics",
              snapshot() {
                return {
                  scene: activeContext.preview?.physics.snapshot() ?? { status: "booting" },
                  interpolation: activeContext.preview?.physicsInterpolation.snapshot() ?? {
                    status: "booting"
                  }
                };
              }
            }
          ];
        },
        panels() {
          return [
            {
              id: "outpost.session",
              label: "Outpost Session",
              area: "dock",
              order: 7,
              sourceKinds: ["world", "camera", "physics"]
            }
          ];
        }
      }
    }
  });
}

function createRendererBootContext(context: OutpostBrowserContext): RendererBootContext {
  return {
    container: context.ui.rendererRoot,
    width: OUTPOST_VIEWPORT.width,
    height: OUTPOST_VIEWPORT.height,
    debug: false,
    onDiagnostic(event) {
      context.preview?.runtime.eventBus.emit(event.type, event.payload, event.source);
    }
  };
}

function contextAssetDiagnostic(
  context: Pick<OutpostBrowserContext, "assetDiagnostics">,
  event: AssetDiagnosticEvent
): void {
  context.assetDiagnostics.unshift(event);
  if (context.assetDiagnostics.length > 16) {
    context.assetDiagnostics.pop();
  }
}

function resolveKeyboardScope(context: OutpostBrowserContext): UiFocusScope {
  const scope = context.uiRuntime.focus().scope;
  const devtoolsOpen = context.uiRuntime
    .openPanels()
    .some((panel) => panel.id === "gamekit.devtools.shell");
  return resolveOutpostKeyboardScope(scope, context.inputBlocked, devtoolsOpen);
}

export function resolveOutpostKeyboardScope(
  focusScope: UiFocusScope,
  inputBlocked: boolean,
  devtoolsOpen: boolean
): UiFocusScope {
  if (devtoolsOpen || focusScope === "devtools") {
    return "devtools";
  }
  if (focusScope === "modal" || focusScope === "text-input" || focusScope === "ui") {
    return focusScope;
  }
  return inputBlocked ? "ui" : "game";
}

function resolveOutpostPixelRatio(): number {
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return Math.min(1.5, Math.max(1, devicePixelRatio));
}

function requireState<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing Outpost app service state: ${name}`);
  }
  return value;
}
