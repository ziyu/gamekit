import { createAppHost } from "../runtime/create-app-host";
import { createAppHostError } from "../runtime/errors";
import type { AppConfigSource, AppServiceBinding } from "../runtime/types";
import { createStandardServiceFactory } from "../standard/create-standard-service-factory";
import type { StandardAppServiceState } from "../standard/types";
import type {
  ConfiguredAppHost,
  CreateConfiguredAppHostOptions,
  GameAppServiceDefinition
} from "./types";

export function createConfiguredAppHost<TContext>(
  options: CreateConfiguredAppHostOptions<TContext>
): ConfiguredAppHost<TContext> {
  const serviceDefinitions = orderServiceDefinitions(
    options.app.services.filter((service) => service.enabled !== false)
  );
  const bindings: AppServiceBinding[] = [];
  const standardStateByContext = new Map<TContext, StandardAppServiceState>();

  for (const service of serviceDefinitions) {
    const factory =
      createStandardServiceFactory(options.profile, service.id, standardStateByContext) ??
      options.profile.extensions?.[service.id];
    if (!factory) {
      throw createAppHostError(
        "app_host.missing_service_provider",
        "Missing app service provider",
        {
          serviceId: service.id,
          profileId: options.profile.id,
          appId: options.app.id
        }
      );
    }

    const produced = factory({
      app: options.app,
      profile: options.profile,
      service,
      services: serviceDefinitions,
      context: options.context,
      resolveConfig: <TConfig>() => service.config as TConfig | undefined,
      requireConfig: <TConfig>() => requireServiceConfig<TConfig>(service)
    });

    bindings.push(...(Array.isArray(produced) ? produced : [produced]));
  }

  return {
    app: options.app,
    profile: options.profile,
    context: options.context,
    host: createAppHost({
      id: `${options.app.id}:${options.profile.id}`,
      configSources: mergeConfigSources(
        options.app.configSources,
        options.profile.configSources,
        options.configSources
      ),
      services: bindings,
      clock: options.clock
    })
  };
}

function orderServiceDefinitions(
  definitions: Array<GameAppServiceDefinition>
): Array<GameAppServiceDefinition> {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const ordered: GameAppServiceDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (definition: GameAppServiceDefinition): void => {
    if (visited.has(definition.id)) {
      return;
    }
    if (visiting.has(definition.id)) {
      throw createAppHostError("app_host.service_cycle", "App service dependency cycle", {
        serviceIds: [...visiting, definition.id]
      });
    }

    visiting.add(definition.id);
    for (const dependencyId of definition.dependencies ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw createAppHostError(
          "app_host.missing_service_dependency",
          "Missing service dependency",
          {
            serviceId: definition.id,
            dependencyId
          }
        );
      }
      visit(dependency);
    }
    visiting.delete(definition.id);
    visited.add(definition.id);
    ordered.push(definition);
  };

  for (const definition of definitions) {
    visit(definition);
  }

  return ordered;
}

function requireServiceConfig<TConfig>(service: GameAppServiceDefinition): TConfig {
  if (service.config === undefined) {
    throw createAppHostError("app_host.missing_service_config", "Missing app service config", {
      serviceId: service.id
    });
  }

  return service.config as TConfig;
}

function mergeConfigSources(
  appSources: AppConfigSource[] | undefined,
  profileSources: AppConfigSource[] | undefined,
  optionSources: AppConfigSource[] | undefined
): AppConfigSource[] {
  return [...(profileSources ?? []), ...(appSources ?? []), ...(optionSources ?? [])];
}
