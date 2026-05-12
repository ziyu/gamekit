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
  const serviceDefinitions = options.app.services.filter((service) => service.enabled !== false);
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
