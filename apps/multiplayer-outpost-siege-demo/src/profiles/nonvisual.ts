import {
  createHeadlessRenderer,
  createMemoryAssetAdapter,
  createStandardAppProfile,
  type AppProfile
} from "@gamekit/app-host";
import type { AssetDiagnosticEvent, AssetLoaderAdapter, AssetManager } from "@gamekit/asset";
import type { DataRegistry } from "@gamekit/data";
import type { DevToolsRuntime } from "@gamekit/devtools";
import { createEventBus, type EventBus } from "@gamekit/event-bus";
import type { GameRuntime } from "@gamekit/game-runtime";
import { createInputRouter, type InputRouter } from "@gamekit/input-core";
import { createMultiplayerRuntime, type MultiplayerRuntime } from "@gamekit/multiplayer-core";
import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";
import { createMemoryPhysicsBackend, type PhysicsBackendAdapter } from "@gamekit/physics-core";
import type { PlatformRuntime } from "@gamekit/platform-core";
import { createMemoryPlatform } from "@gamekit/platform-web";
import type { RendererAdapter } from "@gamekit/renderer-core";
import { createMemorySaveStore, type SaveManager, type SaveStore } from "@gamekit/save";
import { createUiRuntime, type UiRuntime } from "@gamekit/ui-core";
import type { GameWorld } from "@gamekit/world";
import { createKootaWorld } from "@gamekit/world-koota";
import { createOutpostDataRegistry } from "../content";
import { createOutpostPreviewRuntime, type OutpostPreviewRuntime } from "../gameplay";
import { outpostProfileDefinition, type OutpostProfileId } from "./definitions";

type OutpostNonVisualProfileId = Extract<
  OutpostProfileId,
  "headless-server" | "deterministic-test"
>;

export type OutpostNonVisualContext = {
  assetDiagnostics: AssetDiagnosticEvent[];
  platform?: PlatformRuntime | undefined;
  dataRegistry?: DataRegistry | undefined;
  assets?: AssetManager | undefined;
  renderer?: RendererAdapter | undefined;
  inputRouter?: InputRouter | undefined;
  multiplayer?: MultiplayerRuntime | undefined;
  uiRuntime?: UiRuntime | undefined;
  saveManager?: SaveManager | undefined;
  devtools?: DevToolsRuntime | undefined;
  game?: GameRuntime | undefined;
  preview?: OutpostPreviewRuntime | undefined;
};

export type CreateOutpostNonVisualRuntimeContext = {
  dataRegistry: DataRegistry;
  world: GameWorld;
  physicsBackend: PhysicsBackendAdapter;
  eventBus: EventBus;
  seed?: string | undefined;
};

export type CreateOutpostNonVisualProfileOptions = {
  profileId: OutpostNonVisualProfileId;
  platform?: PlatformRuntime | undefined;
  renderer?: RendererAdapter | undefined;
  assetAdapter?: AssetLoaderAdapter | undefined;
  physicsBackend?: PhysicsBackendAdapter | undefined;
  multiplayer?: MultiplayerRuntime | undefined;
  uiRuntime?: UiRuntime | undefined;
  saveStore?: SaveStore | undefined;
  eventBus?: EventBus | undefined;
  clock?: (() => number) | undefined;
  seed?: string | undefined;
  createWorld?: (() => GameWorld) | undefined;
  createRuntime?: ((context: CreateOutpostNonVisualRuntimeContext) => GameRuntime) | undefined;
};

export function createOutpostNonVisualProfile(
  context: OutpostNonVisualContext,
  options: CreateOutpostNonVisualProfileOptions
): AppProfile<OutpostNonVisualContext> {
  const profileDefinition = outpostProfileDefinition(options.profileId);
  const platform =
    options.platform ??
    createMemoryPlatform({
      id: profileDefinition.platform,
      appName: `Outpost Siege ${profileDefinition.runtime}`
    });
  const dataRegistry = createOutpostDataRegistry();
  const renderer = options.renderer ?? createHeadlessRenderer();
  const inputRouter = createInputRouter();
  const multiplayer =
    options.multiplayer ??
    createMultiplayerRuntime({
      id: `outpost.${options.profileId}.runtime`,
      backend: createMemoryMultiplayerBackend({ id: `outpost.${options.profileId}.memory` }),
      connectContext: {
        localPeer: {
          id: `outpost.${options.profileId}.peer.local`,
          displayName: options.profileId === "headless-server" ? "Authority Server" : "Test Host",
          role: options.profileId === "headless-server" ? "server" : "host",
          playerId: "outpost.preview.player"
        }
      }
    });
  const uiRuntime = options.uiRuntime ?? createUiRuntime();
  const physicsBackend = options.physicsBackend ?? createMemoryPhysicsBackend();
  const eventBus =
    options.eventBus ?? createEventBus({ clock: options.clock ?? (() => Date.now()) });

  return createStandardAppProfile({
    id: profileDefinition.id,
    adapters: { platform, renderer },
    expose({ context: exposed, state }) {
      exposed.platform = state.platform;
      exposed.dataRegistry = state.data;
      exposed.assets = state.assets;
      exposed.renderer = state.renderer;
      exposed.inputRouter = state.input;
      exposed.multiplayer = state.multiplayer;
      exposed.uiRuntime = state.ui;
      exposed.saveManager = state.save;
      exposed.devtools = state.devtools;
      exposed.game = state.game;
    },
    services: {
      platform: { adapter: "platform" },
      drivers: { drivers: [] },
      data: { registry: dataRegistry },
      renderer: { adapter: "renderer" },
      assets: {
        adapter: options.assetAdapter ?? createMemoryAssetAdapter(),
        preloadGroups: () => [...profileDefinition.preloadGroups],
        onDiagnostic(event) {
          context.assetDiagnostics.unshift(event);
          if (context.assetDiagnostics.length > 16) {
            context.assetDiagnostics.pop();
          }
        }
      },
      input: { router: inputRouter },
      multiplayer: { runtime: multiplayer },
      ui: { runtime: uiRuntime },
      game: {
        createRuntime({ context: activeContext, state }) {
          const runtimeContext: CreateOutpostNonVisualRuntimeContext = {
            dataRegistry: requireState(state.data, "data"),
            world: options.createWorld?.() ?? createKootaWorld(),
            physicsBackend,
            eventBus,
            ...(options.seed === undefined ? {} : { seed: options.seed })
          };
          if (options.createRuntime) {
            const runtime = options.createRuntime(runtimeContext);
            activeContext.game = runtime;
            return runtime;
          }

          const preview = createOutpostPreviewRuntime(runtimeContext);
          activeContext.preview = preview;
          activeContext.game = preview.runtime;
          return preview.runtime;
        }
      },
      save: {
        store: options.saveStore ?? createMemorySaveStore(),
        formatVersion: "1.0.0",
        gameVersion: "0.1.0",
        contributorPolicy: {
          excludeScopes: ["presentation", "debug", "cache", "ui"]
        }
      },
      devtools: {
        preset: "minimal",
        ui: false,
        options: {
          traceLimit: 300,
          diagnosticLimit: 120,
          profilerBudgetMs: 8
        },
        dataSources({ context: activeContext }) {
          return [
            {
              id: `outpost.${options.profileId}.runtime`,
              label: `Outpost ${profileDefinition.runtime} Runtime`,
              kind: "world",
              snapshot() {
                return (
                  activeContext.preview?.snapshot() ?? {
                    running: activeContext.game?.isRunning() ?? false,
                    profileId: options.profileId
                  }
                );
              }
            }
          ];
        }
      }
    }
  });
}

function requireState<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing Outpost app service state: ${name}`);
  }
  return value;
}
