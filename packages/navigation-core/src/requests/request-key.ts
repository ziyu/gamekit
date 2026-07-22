import { cloneNavigationPoint, isNavigationPoint } from "../contracts/geometry";
import type { NavigationAgentProfileDefinition } from "../contracts/profile";
import type { NavigationPathRequest } from "../contracts/routes";

export function validNavigationRequest(request: NavigationPathRequest): boolean {
  return (
    request.requesterId.trim().length > 0 &&
    request.profileId.trim().length > 0 &&
    isNavigationPoint(request.start) &&
    isNavigationPoint(request.goal) &&
    (request.routeKind === undefined ||
      request.routeKind === "path" ||
      request.routeKind === "field") &&
    (request.maxCost === undefined || (Number.isFinite(request.maxCost) && request.maxCost >= 0))
  );
}

export function cloneNavigationRequest(request: NavigationPathRequest): NavigationPathRequest {
  return {
    ...request,
    start: cloneNavigationPoint(request.start),
    goal: cloneNavigationPoint(request.goal),
    ...(request.metadata === undefined ? {} : { metadata: { ...request.metadata } })
  };
}

export function navigationRequestSignature(
  request: NavigationPathRequest,
  quantization: number
): string {
  return [
    request.requesterId,
    request.profileId,
    navigationPointKey(request.start, quantization),
    navigationPointKey(request.goal, quantization),
    request.goalKey ?? "",
    request.routeKind ?? "path",
    request.maxCost ?? ""
  ].join("|");
}

export function navigationCacheKey(
  request: NavigationPathRequest,
  profile: NavigationAgentProfileDefinition,
  quantization: number
): string {
  return [
    navigationProfileKey(profile),
    navigationPointKey(request.start, quantization),
    navigationPointKey(request.goal, quantization),
    request.goalKey ?? "",
    request.routeKind ?? "path",
    request.maxCost ?? ""
  ].join("|");
}

function navigationProfileKey(profile: NavigationAgentProfileDefinition): string {
  const areas = [...(profile.allowedAreas ?? [])].sort().join(",");
  const costs = Object.entries(profile.costOverrides ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([area, cost]) => `${area}:${cost}`)
    .join(",");
  return `${profile.id}:${profile.radius}:${profile.height ?? ""}:${profile.maxSlope ?? ""}:${areas}:${costs}`;
}

function navigationPointKey(point: NavigationPathRequest["start"], quantization: number): string {
  const quantize = (value: number | undefined) =>
    value === undefined ? "" : Math.round(value / quantization);
  return `${quantize(point.x)},${quantize(point.y)},${quantize(point.z)}`;
}
