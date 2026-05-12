import { createAppConfigRuntime } from "./config-runtime";
import { createAppDiagnostics } from "./diagnostics";
import { runLifecycleStage } from "./lifecycle-coordinator";
import { createAppServiceRegistry } from "./service-registry";
import type { AppHost, AppHostContext, AppLifecyclePhase, CreateAppHostOptions } from "./types";

export function createAppHost(options: CreateAppHostOptions): AppHost {
  let phase: AppLifecyclePhase = "registered";
  const services = createAppServiceRegistry();
  const config = createAppConfigRuntime(options.configSources);
  const diagnostics = createAppDiagnostics({ clock: options.clock });

  for (const binding of options.services ?? []) {
    services.register(binding);
  }

  const host: AppHost = {
    id: options.id,
    services,
    config,
    diagnostics,
    async boot() {
      phase = "booting";
      await runLifecycleStage(services, createContext(host), "boot");
      phase = "booted";
      diagnostics.emit({
        type: "app_host.booted",
        severity: "info",
        source: "app-host",
        payload: { hostId: host.id }
      });
    },
    async start() {
      phase = "starting";
      await runLifecycleStage(services, createContext(host), "start");
      phase = "started";
      diagnostics.emit({
        type: "app_host.started",
        severity: "info",
        source: "app-host",
        payload: { hostId: host.id }
      });
    },
    async stop() {
      phase = "stopping";
      await runLifecycleStage(services, createContext(host), "stop");
      phase = "stopped";
      diagnostics.emit({
        type: "app_host.stopped",
        severity: "info",
        source: "app-host",
        payload: { hostId: host.id }
      });
    },
    async dispose() {
      phase = "disposing";
      await runLifecycleStage(services, createContext(host), "dispose");
      phase = "disposed";
      diagnostics.emit({
        type: "app_host.disposed",
        severity: "info",
        source: "app-host",
        payload: { hostId: host.id }
      });
    },
    snapshot() {
      return {
        id: host.id,
        phase,
        services: services.descriptors().map((descriptor) => {
          const binding = services.binding({ id: descriptor.id });
          const serviceSnapshot = binding?.lifecycle.snapshot?.();
          return serviceSnapshot === undefined
            ? descriptor
            : {
                ...descriptor,
                snapshot: serviceSnapshot
              };
        }),
        config: config.snapshot(),
        diagnostics: diagnostics.list()
      };
    }
  };

  return host;
}

function createContext(host: AppHost): AppHostContext {
  return {
    host,
    services: host.services,
    config: host.config,
    diagnostics: host.diagnostics
  };
}
