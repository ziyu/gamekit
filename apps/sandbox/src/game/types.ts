import type { GameEvent } from "@gamekit/event-bus";
import type { GameRuntime } from "@gamekit/game-runtime";
import type { TcaTraceEntry, TcaTraceStore } from "@gamekit/tca";
import type { EntityId } from "@gamekit/world";

export type SandboxEntitySnapshot = {
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type SandboxSnapshot = {
  running: boolean;
  clock: ReturnType<GameRuntime["clock"]["snapshot"]>;
  entityCount: number;
  entities: SandboxEntitySnapshot[];
  events: GameEvent[];
  tcaRuleCount: number;
  tcaTraces: TcaTraceEntry[];
};

export type SandboxRuntime = {
  runtime: GameRuntime;
  events: GameEvent[];
  tcaTraceStore: TcaTraceStore;
  snapshot(): SandboxSnapshot;
};
