import { createEventBus, type GameEvent } from "@gamekit/event-bus";
import { createGame, type GameInstallContext } from "@gamekit/game-runtime";
import type { GameModule } from "@gamekit/core";
import type { RendererAdapter } from "@gamekit/renderer-core";
import { createTcaModule, createTcaTraceStore, type TcaTraceStore } from "@gamekit/tca";
import { createKootaWorld } from "@gamekit/world-koota";
import type { DataRegistry } from "@gamekit/data";
import { Position, Velocity } from "./components";
import {
  createSandboxDataRegistry,
  getSandboxActorDefinition,
  getSandboxEntityRenderObject,
  getSandboxRenderRigDefinition
} from "./sandbox-data";
import { createSandboxRenderSyncModule } from "./modules/sandbox-render-sync-module";
import { createSandboxMotionModule } from "./modules/sandbox-motion-module";
import { createSandboxTcaDefinitions } from "./modules/sandbox-tca-definitions";
import type { SandboxRuntime } from "./types";

export const SANDBOX_RENDER_SIZE = {
  width: 720,
  height: 524
} as const;

export type CreateSandboxRuntimeOptions = {
  seed?: string;
  renderer?: RendererAdapter;
  dataRegistry?: DataRegistry;
  modules?: Array<GameModule<GameInstallContext>>;
  tcaTraceStore?: TcaTraceStore;
  renderSize?: {
    width: number;
    height: number;
  };
};

export function createSandboxRuntime(
  seedOrOptions: string | CreateSandboxRuntimeOptions = "hero-road-dev-seed"
): SandboxRuntime {
  const options = typeof seedOrOptions === "string" ? { seed: seedOrOptions } : seedOrOptions;
  const world = createKootaWorld();
  const eventBus = createEventBus({ clock: () => Math.round(performance.now()) });
  const events: GameEvent[] = [];
  const dataRegistry = options.dataRegistry ?? createSandboxDataRegistry();
  const tcaTraceStore = options.tcaTraceStore ?? createTcaTraceStore({ limit: 20 });
  const modules = [
    ...(options.modules ?? [
      createTcaModule({
        id: "sandbox.tca",
        dataRegistry,
        traceStore: tcaTraceStore,
        definitions: createSandboxTcaDefinitions()
      })
    ]),
    createSandboxMotionModule({
      actorDefinition: getSandboxActorDefinition(dataRegistry),
      renderObjectDefinition: getSandboxEntityRenderObject(dataRegistry),
      renderRigDefinition: getSandboxRenderRigDefinition(dataRegistry)
    })
  ];

  if (options.renderer) {
    modules.push(
      createSandboxRenderSyncModule({
        renderer: options.renderer,
        size: options.renderSize ?? SANDBOX_RENDER_SIZE
      })
    );
  }

  eventBus.onAny((event) => {
    events.push(event);
    if (events.length > 20) {
      events.shift();
    }
  });

  const runtime = createGame({
    modules,
    world,
    eventBus,
    seed: options.seed ?? "hero-road-dev-seed"
  });

  return {
    runtime,
    events,
    tcaTraceStore,
    snapshot() {
      const entities = world.query([Position, Velocity]).map((entity) => {
        const position = world.get(entity, Position);
        const velocity = world.get(entity, Velocity);

        return {
          id: entity,
          x: position?.x ?? 0,
          y: position?.y ?? 0,
          vx: velocity?.x ?? 0,
          vy: velocity?.y ?? 0
        };
      });

      return {
        running: runtime.isRunning(),
        clock: runtime.clock.snapshot(),
        entityCount: world.count(),
        entities,
        events: [...events],
        tcaRuleCount: dataRegistry.list("tcaRule").length,
        tcaTraces: tcaTraceStore.list()
      };
    }
  };
}
