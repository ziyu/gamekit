import type { DataRegistry } from "@gamekit/data";
import type { EventBus, GameEvent } from "@gamekit/event-bus";
import type { GasRuntime, GasTraceStore } from "@gamekit/gas";
import type { RendererAdapter } from "@gamekit/renderer-core";
import type { TcaTraceStore } from "@gamekit/tca";
import type { EntityId, GameWorld } from "@gamekit/world";
import type { AbyssInputState, AbyssRewardChoice, AbyssRunState, AbyssTraceEntry } from "./types";

export type AbyssRuntimeState = {
  world: GameWorld;
  dataRegistry: DataRegistry;
  eventBus: EventBus;
  renderer?: RendererAdapter | undefined;
  input: AbyssInputState;
  run: AbyssRunState;
  events: GameEvent[];
  timeline: AbyssTraceEntry[];
  gasRuntime: () => GasRuntime | undefined;
  gasTraceStore: GasTraceStore;
  tcaTraceStore: TcaTraceStore;
  activeRoomId?: string | undefined;
  activeWaveId?: string | undefined;
  activeRewardPoolId?: string | undefined;
  playerEntity?: EntityId | undefined;
  roomEntity?: EntityId | undefined;
  setGasRuntime(runtime: GasRuntime): void;
  trace(entry: Omit<AbyssTraceEntry, "id" | "time"> & { time?: number }): void;
};

export function createAbyssRunState(rewards: AbyssRewardChoice[]): AbyssRunState {
  return {
    gold: 0,
    recentLoot: [],
    rewardChoices: rewards,
    rewardOpen: false,
    completed: false,
    paused: false,
    inventoryOpen: false
  };
}

export function consumeMomentaryInput(input: AbyssInputState): void {
  input.attackRequested = false;
  input.skillPrimaryRequested = false;
  input.skillSecondaryRequested = false;
  input.dodgeRequested = false;
  input.interactRequested = false;
  input.inventoryToggleRequested = false;
  input.pauseToggleRequested = false;
  input.rewardChoiceRequested = undefined;
}

export function addRecentLoot(run: AbyssRunState, label: string): void {
  run.recentLoot.unshift(label);
  if (run.recentLoot.length > 5) {
    run.recentLoot.pop();
  }
}
