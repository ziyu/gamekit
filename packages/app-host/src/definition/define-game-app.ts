import type { GameAppDefinition } from "./types";

export function defineGameApp<TServiceConfig = unknown>(
  definition: GameAppDefinition<TServiceConfig>
): GameAppDefinition<TServiceConfig> {
  return definition;
}
