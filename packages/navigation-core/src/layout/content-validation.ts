import type { NavigationPoint } from "../contracts/geometry";
import type { NavigationRuntime } from "../contracts/facade";

export type NavigationProjectionProbe = {
  id: string;
  profileId: string;
  point: NavigationPoint;
  maxDistance?: number | undefined;
};

export type NavigationRequiredPathProbe = {
  id: string;
  profileId: string;
  start: NavigationPoint;
  goal: NavigationPoint;
  maxCost?: number | undefined;
};

export type NavigationContentDiagnostic = {
  code: string;
  message: string;
  probeId: string;
  severity: "error";
};

export type ValidateNavigationContentOptions = {
  runtime: NavigationRuntime;
  projections?: readonly NavigationProjectionProbe[] | undefined;
  requiredPaths?: readonly NavigationRequiredPathProbe[] | undefined;
  maxTicks?: number | undefined;
  tickMs?: number | undefined;
  yieldBetweenTicks?: (() => void | Promise<void>) | undefined;
};

export async function validateNavigationContent(
  options: ValidateNavigationContentOptions
): Promise<NavigationContentDiagnostic[]> {
  const diagnostics: NavigationContentDiagnostic[] = [];
  for (const probe of options.projections ?? []) {
    const projection = options.runtime.projectPoint(probe.point, probe.profileId);
    if (projection === undefined) {
      diagnostics.push({
        code: "navigation.content_projection_failed",
        message: `Navigation point cannot be projected for profile ${probe.profileId}`,
        probeId: probe.id,
        severity: "error"
      });
    } else if (probe.maxDistance !== undefined && projection.distance > probe.maxDistance) {
      diagnostics.push({
        code: "navigation.content_projection_too_far",
        message: `Navigation projection distance ${projection.distance} exceeds ${probe.maxDistance}`,
        probeId: probe.id,
        severity: "error"
      });
    }
  }

  const requests = new Map(
    (options.requiredPaths ?? []).map((probe) => [
      options.runtime.requestPath({
        id: `navigation.content.${probe.id}`,
        requesterId: "navigation.content-validator",
        profileId: probe.profileId,
        start: probe.start,
        goal: probe.goal,
        routeKind: "path",
        ...(probe.maxCost === undefined ? {} : { maxCost: probe.maxCost })
      }),
      probe
    ])
  );
  const maxTicks = positiveInteger(options.maxTicks, 256);
  const tickMs = positive(options.tickMs, 1);
  let elapsed = 0;
  for (let tick = 0; requests.size > 0 && tick < maxTicks; tick += 1) {
    elapsed += tickMs;
    options.runtime.update(tickMs, elapsed);
    for (const [requestId, probe] of requests) {
      const result = options.runtime.poll(requestId);
      if (result.status === "pending") {
        continue;
      }
      requests.delete(requestId);
      if (result.status === "complete") {
        options.runtime.releaseRoute(result.route.routeId);
        continue;
      }
      diagnostics.push({
        code: "navigation.content_required_path_failed",
        message:
          result.status === "failed" || result.status === "rejected"
            ? `Required navigation path failed: ${result.reason}`
            : `Required navigation path ended as ${result.status}`,
        probeId: probe.id,
        severity: "error"
      });
    }
    await options.yieldBetweenTicks?.();
  }
  for (const [requestId, probe] of requests) {
    options.runtime.cancel(requestId);
    diagnostics.push({
      code: "navigation.content_required_path_timeout",
      message: `Required navigation path did not complete within ${maxTicks} ticks`,
      probeId: probe.id,
      severity: "error"
    });
  }
  return diagnostics;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError("Navigation content validation maxTicks must be a positive integer");
  }
  return resolved;
}

function positive(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError("Navigation content validation tickMs must be positive");
  }
  return resolved;
}
