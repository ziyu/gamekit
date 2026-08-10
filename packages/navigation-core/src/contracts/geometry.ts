export type NavigationPoint = {
  x: number;
  y: number;
  z?: number | undefined;
};

export type NavigationProjection = {
  point: NavigationPoint;
  backendNodeId?: string | undefined;
  area?: string | undefined;
  distance: number;
  revision: number;
};

export function isNavigationPoint(value: NavigationPoint): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    (value.z === undefined || Number.isFinite(value.z))
  );
}

export function cloneNavigationPoint(point: NavigationPoint): NavigationPoint {
  return { x: point.x, y: point.y, ...(point.z === undefined ? {} : { z: point.z }) };
}

export function cloneNavigationProjection(projection: NavigationProjection): NavigationProjection {
  return { ...projection, point: cloneNavigationPoint(projection.point) };
}
