import { GameError, Registry } from "@gamekit/core";
import type { WorldSystem } from "@gamekit/world";
import type { SystemRegistry } from "./types";

export function createSystemRegistry(): SystemRegistry {
  const systems = new Registry<WorldSystem>();

  return {
    register(system) {
      if (!system.id) {
        throw new GameError("system.invalid_id", "World system id cannot be empty");
      }

      systems.register(system.id, system);
    },
    values() {
      return systems.values();
    }
  };
}
