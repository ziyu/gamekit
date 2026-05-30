import type { GameRuntime } from "@gamekit/game-runtime";
import type { EntityId } from "@gamekit/world";
import type { GasRuntime, GasTraceStore } from "@gamekit/gas";
import type { TcaTraceStore } from "@gamekit/tca";
import type { GameEvent } from "@gamekit/event-bus";

export type AbyssInputState = {
  moveX: number;
  moveY: number;
  held: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  aimX: number;
  aimY: number;
  attackRequested: boolean;
  skillPrimaryRequested: boolean;
  skillSecondaryRequested: boolean;
  dodgeRequested: boolean;
  interactRequested: boolean;
  inventoryToggleRequested: boolean;
  pauseToggleRequested: boolean;
  rewardChoiceRequested?: string | undefined;
  gameplayBlocked: boolean;
};

export type AbyssTraceEntry = {
  id: string;
  time: number;
  kind: "input" | "combat" | "gas" | "tca" | "loot" | "reward" | "runtime";
  label: string;
  actorId?: string | undefined;
  entityId?: EntityId | undefined;
  payload?: unknown;
};

export type AbyssRewardChoice = {
  id: string;
  label: string;
  detail: string;
  effect: "damage" | "health" | "energy";
  amount: number;
  selected: boolean;
};

export type AbyssRunState = {
  gold: number;
  recentLoot: string[];
  rewardChoices: AbyssRewardChoice[];
  rewardOpen: boolean;
  completed: boolean;
  paused: boolean;
  inventoryOpen: boolean;
  selectedReward?: string | undefined;
};

export type AbyssEntitySnapshot = {
  id: EntityId;
  actorId?: string | undefined;
  label: string;
  role: string;
  faction?: string | undefined;
  x: number;
  y: number;
  health?: number | undefined;
  maxHealth?: number | undefined;
  lootKind?: string | undefined;
  lootLabel?: string | undefined;
};

export type AbyssContentSummary = {
  types: number;
  documents: number;
  references: number;
  activeRoomId?: string | undefined;
  activeWaveId?: string | undefined;
  activeRewardPoolId?: string | undefined;
  documentsByType: Array<{
    type: string;
    count: number;
  }>;
};

export type AbyssActorInspectorSnapshot = {
  actorId: string;
  entityId?: EntityId | undefined;
  definitionId: string;
  attributes: Record<string, { current: number; base: number }>;
  tags: string[];
  activeEffects: Array<{
    id: string;
    effectId: string;
    expiresAt?: number | undefined;
    nextTickAt?: number | undefined;
  }>;
  abilities: Array<{
    id: string;
    cooldownUntil: number;
  }>;
};

export type AbyssSnapshot = {
  running: boolean;
  clock: ReturnType<GameRuntime["clock"]["snapshot"]>;
  objective: {
    label: string;
    remainingEnemies: number;
    completed: boolean;
  };
  player: {
    health: number;
    maxHealth: number;
    energy: number;
    maxEnergy: number;
    gold: number;
    inventoryOpen: boolean;
    paused: boolean;
  };
  skills: Array<{
    id: string;
    key: string;
    label: string;
    cooldownRemainingMs: number;
    ready: boolean;
  }>;
  pickupPrompt?: {
    label: string;
    distance: number;
  };
  rewardOpen: boolean;
  rewardChoices: AbyssRewardChoice[];
  entities: AbyssEntitySnapshot[];
  recentLoot: string[];
  contentSummary: AbyssContentSummary;
  actorInspectors: AbyssActorInspectorSnapshot[];
  timeline: AbyssTraceEntry[];
  events: GameEvent[];
  gasTraces: ReturnType<GasTraceStore["list"]>;
  tcaTraces: ReturnType<TcaTraceStore["list"]>;
};

export type AbyssRuntime = {
  runtime: GameRuntime;
  gasRuntime: () => GasRuntime | undefined;
  tcaTraceStore: TcaTraceStore;
  gasTraceStore: GasTraceStore;
  input: AbyssInputState;
  run: AbyssRunState;
  trace(entry: Omit<AbyssTraceEntry, "id" | "time"> & { time?: number }): void;
  snapshot(): AbyssSnapshot;
};
