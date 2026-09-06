import { createAppHostError } from "./errors";
import { createAppConfigRuntime } from "./config-runtime";
import { createAppDiagnostics } from "./diagnostics";
import { runLifecycleStage, runLifecycleTick } from "./lifecycle-coordinator";
import { createAppServiceRegistry } from "./service-registry";
import type { AppHost, AppHostContext, AppLifecyclePhase, CreateAppHostOptions } from "./types";

export function createAppHost(options: CreateAppHostOptions): AppHost {
  let phase: AppLifecyclePhase = "registered";
  let booted = false;
  let failed = false;
  let pendingStops = 0;
  let disposalRequested = false;
  const clock = options.clock ?? (() => Date.now());
  const services = createAppServiceRegistry();
  const config = createAppConfigRuntime(options.configSources);
  const diagnostics = createAppDiagnostics({ clock });
  let lifecycleQueue: Promise<void> = Promise.resolve();

  for (const binding of options.services ?? []) {
    services.register(binding);
  }

  const host: AppHost = {
    id: options.id,
    services,
    config,
    diagnostics,
    boot() {
      return enqueue(async () => {
        assertUsable();
        if (booted || phase === "started") return;
        phase = "booting";
        await runStage("boot");
        booted = true;
        phase = "booted";
        diagnostics.emit({
          type: "app_host.booted",
          severity: "info",
          source: "app-host",
          payload: { hostId: host.id }
        });
      });
    },
    start() {
      return enqueue(async () => {
        assertUsable();
        if (phase === "started") return;
        phase = "starting";
        await runStage("start");
        phase = "started";
        diagnostics.emit({
          type: "app_host.started",
          severity: "info",
          source: "app-host",
          payload: { hostId: host.id }
        });
      });
    },
    tick(delta, timestamp = clock()) {
      if (phase !== "started" || pendingStops > 0 || disposalRequested) {
        return;
      }
      try {
        runLifecycleTick(services, createContext(host), { delta, timestamp });
      } catch (error) {
        failed = true;
        phase = "failed";
        throw error;
      }
    },
    stop() {
      pendingStops += 1;
      return enqueue(async () => {
        try {
          if (phase === "stopped" || phase === "registered") return;
          if (phase === "disposed" || phase === "disposing") return;
          phase = "stopping";
          await runStage("stop");
          phase = "stopped";
          diagnostics.emit({
            type: "app_host.stopped",
            severity: "info",
            source: "app-host",
            payload: { hostId: host.id }
          });
        } finally {
          pendingStops -= 1;
        }
      });
    },
    dispose() {
      disposalRequested = true;
      return enqueue(async () => {
        if (phase === "disposed") return;
        phase = "disposing";
        try {
          await runLifecycleStage(services, createContext(host), "dispose");
        } finally {
          phase = "disposed";
        }
        diagnostics.emit({
          type: "app_host.disposed",
          severity: "info",
          source: "app-host",
          payload: { hostId: host.id }
        });
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

  function assertUsable(): void {
    if (phase === "disposed" || disposalRequested)
      throw createAppHostError("app_host.disposed", "App host is disposed");
    if (failed || phase === "failed")
      throw createAppHostError(
        "app_host.failed",
        "Dispose the failed host before creating a new session"
      );
  }

  async function runStage(stage: "boot" | "start" | "stop"): Promise<void> {
    try {
      await runLifecycleStage(services, createContext(host), stage);
    } catch (error) {
      failed = true;
      phase = "failed";
      throw error;
    }
  }

  function enqueue(operation: () => Promise<void>): Promise<void> {
    lifecycleQueue = lifecycleQueue.catch(() => undefined).then(operation);
    return lifecycleQueue;
  }

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
