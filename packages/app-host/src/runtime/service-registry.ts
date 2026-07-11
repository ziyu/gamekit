import {
  ASSET_SERVICE,
  DATA_SERVICE,
  DEVTOOLS_SERVICE,
  DRIVER_SERVICE,
  GAME_SERVICE,
  INPUT_SERVICE,
  MULTIPLAYER_SERVICE,
  PLATFORM_SERVICE,
  RENDERER_SERVICE,
  SAVE_SERVICE,
  UI_SERVICE
} from "./standard-keys";
import { createDuplicateServiceError, createMissingServiceError } from "./errors";
import type {
  AppLifecyclePhase,
  AppServiceBinding,
  AppServiceDescriptor,
  AppServiceKey,
  AppServiceRegistry,
  AppStandardServiceId
} from "./types";

type StoredBinding = {
  binding: AppServiceBinding;
  phase: AppLifecyclePhase;
};

export function createAppServiceRegistry(): AppServiceRegistry {
  const bindings = new Map<string, StoredBinding>();

  const registry: AppServiceRegistry = {
    has(key) {
      return bindings.has(key.id);
    },
    get<TService>(key: AppServiceKey<TService>): TService | undefined {
      return bindings.get(key.id)?.binding.service as TService | undefined;
    },
    require(key) {
      const service = registry.get(key);
      if (!service) {
        throw createMissingServiceError(key.id);
      }

      return service;
    },
    register(binding) {
      if (bindings.has(binding.key.id)) {
        throw createDuplicateServiceError(binding.key.id);
      }

      bindings.set(binding.key.id, {
        binding,
        phase: "registered"
      });
      assignStandardService(registry, binding);
    },
    unregister(key) {
      const binding = bindings.get(key.id)?.binding;
      bindings.delete(key.id);
      if (binding?.standard) {
        deleteStandardService(registry, binding.standard);
      }
    },
    binding<TService>(key: AppServiceKey<TService>): AppServiceBinding<TService> | undefined {
      return bindings.get(key.id)?.binding as AppServiceBinding<TService> | undefined;
    },
    bindings() {
      return [...bindings.values()].map((entry) => entry.binding);
    },
    descriptors() {
      return [...bindings.values()].map(toDescriptor);
    },
    setPhase(serviceId, phase) {
      const entry = bindings.get(serviceId);
      if (!entry) {
        throw createMissingServiceError(serviceId);
      }

      entry.phase = phase;
    }
  };

  return registry;
}

function toDescriptor(entry: StoredBinding): AppServiceDescriptor {
  const descriptor: AppServiceDescriptor = {
    id: entry.binding.key.id,
    phase: entry.phase,
    dependencies: entry.binding.lifecycle.dependencies ?? []
  };
  if (entry.binding.key.description) {
    descriptor.description = entry.binding.key.description;
  }
  if (entry.binding.standard) {
    descriptor.standard = entry.binding.standard;
  }

  return descriptor;
}

function assignStandardService(
  registry: AppServiceRegistry,
  binding: AppServiceBinding<unknown>
): void {
  const standard = binding.standard ?? standardFromKey(binding.key);
  if (!standard) {
    return;
  }

  if (standard === "platform") {
    registry.platform = binding.service as never;
  }
  if (standard === "drivers") {
    registry.drivers = binding.service as never;
  }
  if (standard === "data") {
    registry.data = binding.service as never;
  }
  if (standard === "assets") {
    registry.assets = binding.service as never;
  }
  if (standard === "renderer") {
    registry.renderer = binding.service as never;
  }
  if (standard === "input") {
    registry.input = binding.service as never;
  }
  if (standard === "multiplayer") {
    registry.multiplayer = binding.service as never;
  }
  if (standard === "game") {
    registry.game = binding.service as never;
  }
  if (standard === "ui") {
    registry.ui = binding.service as never;
  }
  if (standard === "save") {
    registry.save = binding.service as never;
  }
  if (standard === "devtools") {
    registry.devtools = binding.service as never;
  }
}

function deleteStandardService(registry: AppServiceRegistry, standard: AppStandardServiceId): void {
  delete registry[standard];
}

function standardFromKey(key: AppServiceKey<unknown>): AppStandardServiceId | undefined {
  if (key.id === PLATFORM_SERVICE.id) {
    return "platform";
  }
  if (key.id === DRIVER_SERVICE.id) {
    return "drivers";
  }
  if (key.id === DATA_SERVICE.id) {
    return "data";
  }
  if (key.id === ASSET_SERVICE.id) {
    return "assets";
  }
  if (key.id === RENDERER_SERVICE.id) {
    return "renderer";
  }
  if (key.id === INPUT_SERVICE.id) {
    return "input";
  }
  if (key.id === MULTIPLAYER_SERVICE.id) {
    return "multiplayer";
  }
  if (key.id === GAME_SERVICE.id) {
    return "game";
  }
  if (key.id === UI_SERVICE.id) {
    return "ui";
  }
  if (key.id === SAVE_SERVICE.id) {
    return "save";
  }
  if (key.id === DEVTOOLS_SERVICE.id) {
    return "devtools";
  }

  return undefined;
}
