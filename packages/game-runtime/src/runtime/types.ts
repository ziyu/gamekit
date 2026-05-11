import type { Clock, GameModule, Rng } from "@gamekit/core";
import type { EventBus } from "@gamekit/event-bus";
import type { GameWorld, WorldSystem } from "@gamekit/world";

export type SystemRegistry = {
  register(system: WorldSystem): void;
  values(): WorldSystem[];
};

export type GameInstallContext = {
  world: GameWorld;
  eventBus: EventBus;
  rng: Rng;
  systems: SystemRegistry;
};

export type GameRuntime = {
  readonly world: GameWorld;
  readonly eventBus: EventBus;
  readonly rng: Rng;
  readonly clock: Clock;
  readonly systems: SystemRegistry;
  readonly modules: Array<GameModule<GameInstallContext>>;
  start(): void;
  stop(): void;
  tick(delta: number): void;
  isRunning(): boolean;
};

export type CreateGameConfig = {
  modules: Array<GameModule<GameInstallContext>>;
  world: GameWorld;
  eventBus: EventBus;
  seed: string;
};
