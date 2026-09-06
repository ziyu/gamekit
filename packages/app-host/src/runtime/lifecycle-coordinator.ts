import {
  createMissingServiceDependencyError,
  createServiceCycleError,
  createServiceLifecycleError
} from "./errors";
import type {
  AppHostContext,
  AppFrame,
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
  const teardown = stage === "stop" || stage === "dispose";
  const errors: unknown[] = [];
  let bindings: AppServiceBinding[];
  try {
    bindings = orderBindings(registry.bindings());
  } catch (error) {
    if (!teardown) throw error;
    errors.push(error);
    bindings = registry.bindings();
  }
  const ordered = teardown ? bindings.reverse() : bindings;

  for (const binding of ordered) {
    try {
      await runBindingStage(registry, ctx, binding, stage);
    } catch (error) {
      if (stage === "boot" || stage === "start") throw error;
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, `App services failed during ${stage}`);
}

export function runLifecycleTick(
  registry: AppServiceRegistry,
  ctx: AppHostContext,
  frame: AppFrame
): void {
  for (const binding of orderBindings(registry.bindings())) {
    const profiler = ctx.services.devtools;
    const span = profiler?.beginProfilerSpan({
      name: `${binding.lifecycle.id}.tick`,
      category: "service",
      source: binding.lifecycle.id,
      metadata: { serviceId: binding.lifecycle.id, stage: "tick" }
    });
    try {
      binding.lifecycle.tick?.(ctx, frame);
      if (span) {
        profiler?.endProfilerSpan(span);
      }
    } catch (cause) {
      if (span) {
        profiler?.endProfilerSpan(span, {
          tags: ["error"],
          metadata: { error: cause instanceof Error ? cause.message : String(cause) }
        });
      }
      registry.setPhase(binding.lifecycle.id, "failed");
      ctx.diagnostics.emit({
        type: "app_host.service_failed",
        severity: "error",
        source: "app-host",
        payload: {
          serviceId: binding.lifecycle.id,
          stage: "tick",
          error: cause instanceof Error ? cause.message : String(cause)
        }
      });
      throw createServiceLifecycleError(binding.lifecycle.id, "tick", cause);
    }
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

  const profiler = ctx.services.devtools;
  const span = profiler?.beginProfilerSpan({
    name: `${binding.lifecycle.id}.${stage}`,
    category: "service",
    source: binding.lifecycle.id,
    metadata: { serviceId: binding.lifecycle.id, stage }
  });
  try {
    await binding.lifecycle[stage]?.(ctx);
    if (span) {
      profiler?.endProfilerSpan(span);
    }
  } catch (cause) {
    if (span) {
      profiler?.endProfilerSpan(span, {
        tags: ["error"],
        metadata: { error: cause instanceof Error ? cause.message : String(cause) }
      });
    }
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
