import { createPlatformMissingServiceError } from "./errors";
import type {
  PlatformCapabilityDescriptor,
  PlatformCapabilityRegistry,
  PlatformCapabilityState,
  PlatformPermissionState,
  PlatformRuntimeId,
  PlatformServiceId,
  PlatformServiceKey,
  PlatformServiceRegistry,
  PlatformServices,
  PlatformStandardServices
} from "./types";

export function definePlatformService<TService>(
  id: PlatformServiceId,
  options: Omit<PlatformServiceKey<TService>, "id" | "_service"> = {}
): PlatformServiceKey<TService> {
  return { id, ...options };
}

export function createPlatformServiceRegistry(
  platformId: PlatformRuntimeId,
  initialServices: Array<{ key: PlatformServiceKey<unknown>; service: unknown }> = []
): PlatformServiceRegistry {
  const services = new Map<PlatformServiceId, unknown>();

  const registry: PlatformServiceRegistry = {
    has(key) {
      return services.has(key.id);
    },
    get<TService>(key: PlatformServiceKey<TService>) {
      return services.get(key.id) as any;
    },
    require<TService>(key: PlatformServiceKey<TService>) {
      if (!services.has(key.id)) {
        throw createPlatformMissingServiceError(platformId, key.id);
      }

      return services.get(key.id) as TService;
    },
    register(key, service) {
      services.set(key.id, service);
    },
    list() {
      return [...services.keys()].sort();
    }
  };

  for (const { key, service } of initialServices) {
    registry.register(key, service);
  }

  return registry;
}

export function createPlatformServices(
  platformId: PlatformRuntimeId,
  standardServices: PlatformStandardServices,
  initialServices: Array<{ key: PlatformServiceKey<unknown>; service: unknown }> = []
): PlatformServices {
  return Object.assign(
    createPlatformServiceRegistry(platformId, initialServices),
    standardServices
  );
}

export function createPlatformCapabilityRegistry(options: {
  queryPermission: (capability: string) => Promise<PlatformPermissionState>;
  descriptors?: PlatformCapabilityDescriptor[];
}): PlatformCapabilityRegistry {
  const descriptors = new Map<string, PlatformCapabilityDescriptor>();

  for (const descriptor of options.descriptors ?? []) {
    descriptors.set(descriptor.id, descriptor);
  }

  return {
    register(descriptor) {
      descriptors.set(descriptor.id, descriptor);
    },
    describe(capability) {
      return descriptors.get(capability);
    },
    async query(capability): Promise<PlatformCapabilityState> {
      const permission = await options.queryPermission(capability);
      const state: PlatformCapabilityState = {
        id: capability,
        available: permission === "granted" || permission === "prompt",
        permission
      };

      if (permission === "unsupported") {
        state.reason = "unsupported";
      }

      return state;
    },
    list() {
      return [...descriptors.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
  };
}
