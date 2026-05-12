import {
  createMissingServiceDependencyError,
  createServiceCycleError,
  createServiceLifecycleError
} from "./errors";
import type {
  AppHostContext,
  AppLifecyclePhase,
  AppLifecycleStage,
  AppServiceBinding,
  AppServiceId,
  AppServiceRegistry
} from "./types";

export async function runLifecycleStage(
  registry: AppServiceRegistry,
  ctx: AppHostContext,
  stage: AppLifecycleStage
): Promise<void> {
  const bindings = orderBindings(registry.bindings());
  const ordered = stage === "stop" || stage === "dispose" ? bindings.reverse() : bindings;

  for (const binding of ordered) {
    await runBindingStage(registry, ctx, binding, stage);
  }
}

export function orderBindings(bindings: Array<AppServiceBinding>): Array<AppServiceBinding> {
  const byId = new Map(bindings.map((binding) => [binding.lifecycle.id, binding]));
  const ordered: AppServiceBinding[] = [];
  const visiting = new Set<AppServiceId>();
  const visited = new Set<AppServiceId>();

  const visit = (binding: AppServiceBinding): void => {
    if (visited.has(binding.lifecycle.id)) {
      return;
    }
    if (visiting.has(binding.lifecycle.id)) {
      throw createServiceCycleError([...visiting, binding.lifecycle.id]);
    }

    visiting.add(binding.lifecycle.id);
    for (const dependencyId of binding.lifecycle.dependencies ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw createMissingServiceDependencyError(binding.lifecycle.id, dependencyId);
      }
      visit(dependency);
    }
    visiting.delete(binding.lifecycle.id);
    visited.add(binding.lifecycle.id);
    ordered.push(binding);
  };

  for (const binding of bindings) {
    visit(binding);
  }

  return ordered;
}

async function runBindingStage(
  registry: AppServiceRegistry,
  ctx: AppHostContext,
  binding: AppServiceBinding,
  stage: AppLifecycleStage
): Promise<void> {
  const phase = phaseForStage(stage);
  registry.setPhase(binding.lifecycle.id, phase.before);
  ctx.diagnostics.emit({
    type: `app_host.service_${stage}`,
    severity: "info",
    source: "app-host",
    payload: { serviceId: binding.lifecycle.id, phase: phase.before }
  });

  try {
    await binding.lifecycle[stage]?.(ctx);
  } catch (cause) {
    registry.setPhase(binding.lifecycle.id, "failed");
    ctx.diagnostics.emit({
      type: "app_host.service_failed",
      severity: "error",
      source: "app-host",
      payload: {
        serviceId: binding.lifecycle.id,
        stage,
        error: cause instanceof Error ? cause.message : String(cause)
      }
    });
    throw createServiceLifecycleError(binding.lifecycle.id, stage, cause);
  }

  registry.setPhase(binding.lifecycle.id, phase.after);
}

function phaseForStage(stage: AppLifecycleStage): {
  before: AppLifecyclePhase;
  after: AppLifecyclePhase;
} {
  if (stage === "boot") {
    return { before: "booting", after: "booted" };
  }
  if (stage === "start") {
    return { before: "starting", after: "started" };
  }
  if (stage === "stop") {
    return { before: "stopping", after: "stopped" };
  }

  return { before: "disposing", after: "disposed" };
}
