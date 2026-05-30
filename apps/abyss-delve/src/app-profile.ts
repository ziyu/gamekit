import { createStandardAppProfile, type AppProfile } from "@gamekit/app-host";
import { createAssetDataType } from "@gamekit/asset";
import type { DataTypeDefinition } from "@gamekit/data";
import type { DataRegistry } from "@gamekit/data";
import type { DevToolsRuntime } from "@gamekit/devtools";
import { createPhaserDriver } from "@gamekit/driver-phaser";
import { createInputRouter, type InputRouter } from "@gamekit/input-core";
import { createDomInputAdapter } from "@gamekit/input-dom";
import { createWebPlatform } from "@gamekit/platform-web";
import type { RendererAdapter, RendererBootContext } from "@gamekit/renderer-core";
import { createPlatformStorageSaveStore, type SaveManager } from "@gamekit/save";
import type { UiRuntime } from "@gamekit/ui-core";
import { createKootaWorld } from "@gamekit/world-koota";
import { configureAbyssInputRouter } from "./app-input";
import {
  ABYSS_VIEWPORT,
  createAbyssDataRegistry,
  createAbyssRuntime,
  type AbyssRuntime
} from "./game";

export type AbyssAppUiHandles = {
  rendererRoot: HTMLElement;
};

export type AbyssAppContext = {
  ui: AbyssAppUiHandles;
  uiRuntime: UiRuntime;
  inputBlocked: boolean;
  platform?: ReturnType<typeof createWebPlatform> | undefined;
  dataRegistry?: DataRegistry | undefined;
  renderer?: RendererAdapter | undefined;
  inputRouter?: InputRouter | undefined;
  saveManager?: SaveManager | undefined;
  devtools?: DevToolsRuntime | undefined;
  abyss?: AbyssRuntime | undefined;
};

export function createAbyssWebProfile(): AppProfile<AbyssAppContext> {
  const platform = createWebPlatform({ appName: "Abyss Delve" });
  const dataRegistry = createAbyssDataRegistry();
  const phaserDriver = createPhaserDriver({
    id: "abyss.phaser",
    backgroundColor: "#111113"
  });
  const inputRouter = createInputRouter();

  return createStandardAppProfile({
    id: "web",
    adapters: {
      platform
    },
    expose({ context, state }) {
      context.platform = state.platform as ReturnType<typeof createWebPlatform>;
      context.dataRegistry = state.data;
      context.renderer = state.renderer;
      context.inputRouter = state.input;
      context.saveManager = state.save;
      context.devtools = state.devtools;
      if (state.ui) {
        context.uiRuntime = state.ui;
      }
    },
    services: {
      platform: { adapter: "platform" },
      drivers: {
        drivers: [phaserDriver],
        boot({ context, requireConfig }) {
          return createRendererBootContext(context, requireConfig());
        }
      },
      data: {
        registry: dataRegistry,
        types() {
          return [createAssetDataType() as DataTypeDefinition];
        }
      },
      renderer: {
        driver: "abyss.phaser"
      },
      assets: {
        driver: "abyss.phaser"
      },
      input: {
        router: inputRouter,
        configure(_ctx, router) {
          configureAbyssInputRouter(router);
        },
        adapters({ context }, router) {
          return [
            createDomInputAdapter({
              target: window,
              capture: true,
              source: "abyss.dom",
              scope: (event) => resolveInputScope(context, event),
              eventFilter: (event) => isKeyboardEvent(event) || isPointerInRenderer(context, event),
              onInput(event) {
                router.handle(event);
              }
            })
          ];
        },
        driverSources: [
          {
            driver: "abyss.phaser",
            source: "abyss.phaser.input",
            devices: ["mouse", "touch", "pen"],
            scope: "game"
          }
        ]
      },
      ui: {
        runtime({ context }) {
          return context.uiRuntime;
        },
        panels() {
          return [
            { id: "abyss.hud", title: "HUD", kind: "hud", tags: ["abyss"] },
            { id: "abyss.reward", title: "Reward", kind: "modal", tags: ["abyss"] },
            { id: "abyss.inventory", title: "Inventory", kind: "window", tags: ["abyss"] }
          ];
        }
      },
      game: {
        createRuntime({ context, state }) {
          const runtime = createAbyssRuntime({
            renderer: requireState(state.renderer, "renderer"),
            dataRegistry: requireState(state.data, "data"),
            world: createKootaWorld()
          });
          runtime.input.aimX = ABYSS_VIEWPORT.width / 2;
          runtime.input.aimY = ABYSS_VIEWPORT.height / 2;
          context.abyss = runtime;
          return runtime.runtime;
        }
      },
      save: {
        store: createPlatformStorageSaveStore({
          storage: platform.services.storage,
          prefix: "abyss-delve.save"
        }),
        formatVersion: "1.0.0",
        gameVersion: "0.1.0",
        serviceContext: {
          include: ["data", "game"]
        },
        contributorPolicy: {
          excludeScopes: ["presentation", "debug", "cache", "ui"]
        }
      },
      devtools: {
        options: {
          traceLimit: 500,
          diagnosticLimit: 200,
          profilerBudgetMs: 6
        },
        ui: {
          launcher: { label: "DevTools", position: "top-right" },
          pins: true,
          shell: { title: "Abyss Delve DevTools" }
        },
        dataSources({ context }) {
          return [
            {
              id: "abyss",
              label: "Abyss Run",
              kind: "custom",
              snapshot() {
                return context.abyss?.snapshot() ?? { status: "booting" };
              }
            }
          ];
        }
      }
    }
  });
}

function createRendererBootContext(
  context: AbyssAppContext,
  config: { width?: number; height?: number; debug?: boolean }
): RendererBootContext {
  const boot: RendererBootContext = {
    container: context.ui.rendererRoot,
    width: config.width ?? ABYSS_VIEWPORT.width,
    height: config.height ?? ABYSS_VIEWPORT.height,
    onDiagnostic(event) {
      context.abyss?.runtime.eventBus.emit(event.type, event.payload, event.source);
    }
  };
  if (config.debug !== undefined) {
    boot.debug = config.debug;
  }
  return boot;
}

function resolveInputScope(context: AbyssAppContext, event: Event): "game" | "ui" {
  if (context.inputBlocked) {
    return isKeyboardEvent(event) ? "game" : "ui";
  }
  if (isKeyboardEvent(event)) {
    return "game";
  }
  return isPointerInRenderer(context, event) ? "game" : "ui";
}

function isPointerInRenderer(context: AbyssAppContext, event: Event): boolean {
  return (
    (event.type.startsWith("pointer") || event.type === "wheel") &&
    event.target instanceof Node &&
    context.ui.rendererRoot.contains(event.target)
  );
}

function isKeyboardEvent(event: Event): boolean {
  return event.type === "keydown" || event.type === "keyup";
}

function requireState<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing app service state: ${name}`);
  }
  return value;
}
