import { createDataRegistry, type DataRegistry } from "@gamekit/data";
import { createEventBus, type EventBus } from "@gamekit/event-bus";
import { createGame } from "@gamekit/game-runtime";
import {
  createGasDataTypes,
  createGasModule,
  createGasTcaDefinitions,
  createGasTraceStore,
  type GasRuntime
} from "@gamekit/gas";
import type { RendererAdapter } from "@gamekit/renderer-core";
import {
  createTcaModule,
  createTcaRuleDataType,
  createTcaTraceStore,
  mergeTcaDefinitionSets,
  type TcaTraceStore
} from "@gamekit/tca";
import type { GameWorld } from "@gamekit/world";
import {
  abyssDataPack,
  createAbyssDataTypes,
  ABYSS_REWARD_TYPE,
  type AbyssRewardDefinition
} from "./content";
import { ABYSS_SEED } from "./constants";
import { createAbyssInputState } from "./input-state";
import { createAbyssRunState, type AbyssRuntimeState } from "./runtime-state";
import { appendEvent, attachRuntimeSnapshot, createAbyssSnapshot } from "./snapshot";
import type { AbyssRewardChoice, AbyssRuntime } from "./types";
import { createAbyssTcaDefinitions } from "./modules/abyss-tca-definitions";
import { createAbyssCombatModule } from "./modules/combat-module";
import { createAbyssEnemyAiModule } from "./modules/enemy-ai-module";
import { createAbyssInputResetModule } from "./modules/input-reset-module";
import { createAbyssLootModule } from "./modules/loot-module";
import { createAbyssPlayerControlModule } from "./modules/player-control-module";
import { createAbyssPresentationModule } from "./modules/presentation-module";
import { createAbyssRoomModule } from "./modules/room-module";

export type CreateAbyssRuntimeOptions = {
  renderer?: RendererAdapter | undefined;
  dataRegistry?: DataRegistry | undefined;
  world?: GameWorld | undefined;
  eventBus?: EventBus | undefined;
  seed?: string | undefined;
  gasTraceStore?: ReturnType<typeof createGasTraceStore> | undefined;
  tcaTraceStore?: TcaTraceStore | undefined;
};

export function createAbyssDataRegistry(): DataRegistry {
  const registry = createDataRegistry();
  for (const type of createAbyssDataTypes()) {
    registry.registerType(type);
  }
  for (const type of createGasDataTypes()) {
    registry.registerType(type);
  }
  registry.registerType(createTcaRuleDataType());
  registry.registerPack(abyssDataPack);
  return registry;
}

export function createAbyssRuntime(options: CreateAbyssRuntimeOptions = {}): AbyssRuntime {
  const dataRegistry = options.dataRegistry ?? createAbyssDataRegistry();
  const world = requireOption(options.world, "world");
  const eventBus = options.eventBus ?? createEventBus({ clock: () => Date.now() });
  const gasTraceStore = options.gasTraceStore ?? createGasTraceStore({ limit: 80 });
  const tcaTraceStore = options.tcaTraceStore ?? createTcaTraceStore({ limit: 80 });
  let gasRuntime: GasRuntime | undefined;
  const state: AbyssRuntimeState = {
    world,
    dataRegistry,
    eventBus,
    renderer: options.renderer,
    input: createAbyssInputState(),
    run: createAbyssRunState(createRewardChoices(dataRegistry)),
    events: [],
    timeline: [],
    gasRuntime: () => gasRuntime,
    tcaTraceStore,
    gasTraceStore,
    setGasRuntime(runtime) {
      gasRuntime = runtime;
    },
    trace(entry) {
      state.timeline.unshift({
        id: `abyss.trace.${state.timeline.length + 1}`,
        time: entry.time ?? Date.now(),
        ...entry
      });
      if (state.timeline.length > 80) {
        state.timeline.pop();
      }
    }
  };

  eventBus.onAny((event) => {
    appendEvent(state.events, event);
    state.trace({
      kind: event.type.startsWith("gas.")
        ? "gas"
        : event.type.startsWith("abyss.loot")
          ? "loot"
          : event.type.startsWith("abyss.reward")
            ? "reward"
            : "runtime",
      label: event.type,
      payload: event.payload
    });
  });

  const modules = [
    createGasModule({
      id: "abyss.gas",
      dataRegistry,
      eventBus,
      traceStore: gasTraceStore,
      onRuntime(runtime) {
        gasRuntime = runtime;
        state.setGasRuntime(runtime);
      }
    }),
    createTcaModule({
      id: "abyss.tca",
      dataRegistry,
      eventBus,
      traceStore: tcaTraceStore,
      definitions: mergeTcaDefinitionSets(
        createAbyssTcaDefinitions({ state, dataRegistry }),
        createGasTcaDefinitions({ runtime: () => gasRuntime })
      )
    }),
    createAbyssRoomModule(state),
    createAbyssPlayerControlModule(state),
    createAbyssEnemyAiModule(state),
    createAbyssCombatModule({ state }),
    createAbyssLootModule({ state }),
    ...(options.renderer
      ? [
          createAbyssPresentationModule({
            renderer: options.renderer,
            dataRegistry,
            state
          })
        ]
      : []),
    createAbyssInputResetModule(state)
  ];

  const runtime = createGame({
    modules,
    world,
    eventBus,
    seed: options.seed ?? ABYSS_SEED
  });

  return {
    runtime,
    gasRuntime: () => gasRuntime,
    tcaTraceStore,
    gasTraceStore,
    input: state.input,
    run: state.run,
    trace: state.trace,
    snapshot() {
      return attachRuntimeSnapshot(
        createAbyssSnapshot(state),
        runtime.clock.snapshot(),
        runtime.isRunning()
      );
    }
  };
}

function createRewardChoices(dataRegistry: DataRegistry): AbyssRewardChoice[] {
  return dataRegistry.list<AbyssRewardDefinition>(ABYSS_REWARD_TYPE).map((document) => ({
    ...document.data,
    selected: false
  }));
}

function requireOption<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing Abyss runtime option: ${name}`);
  }
  return value;
}
