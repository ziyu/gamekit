export type NavigationObstacleTarget =
  | { kind: "edge"; id: string }
  | { kind: "area"; id: string }
  | { kind: "portal"; id: string }
  | { kind: "custom"; id: string };

export type NavigationObstacleUpdate = {
  id: string;
  target: NavigationObstacleTarget;
  blocked?: boolean | undefined;
  costMultiplier?: number | undefined;
  source?: string | undefined;
};

export type NavigationObstacleUpdateResult = {
  status: "changed" | "unchanged" | "unsupported";
  revision: number;
  invalidatedRouteFields?: number | undefined;
  invalidatedPathDependencies?: NavigationObstacleTarget[] | undefined;
  invalidateAllPaths?: boolean | undefined;
};

export function cloneNavigationDependencies(
  dependencies: NavigationObstacleTarget[] | undefined
): NavigationObstacleTarget[] | undefined {
  return dependencies?.map((dependency) => ({ ...dependency }));
}

export function navigationDependencyKey(dependency: NavigationObstacleTarget): string {
  return `${dependency.kind}:${dependency.id}`;
}
