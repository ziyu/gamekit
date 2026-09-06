import { cloneBackendPathResult } from "../backend/clone";
import type { NavigationBackendPathResult } from "../backend/port";
import type { NavigationObstacleUpdateResult } from "../contracts/obstacle";
import { cloneNavigationDependencies, navigationDependencyKey } from "../contracts/obstacle";

type CachedPath = {
  result: NavigationBackendPathResult;
  revision: number;
  expiresAt: number;
  negative: boolean;
};

export type NavigationPathCache = {
  get(key: string, revision: number, elapsed: number): NavigationBackendPathResult | undefined;
  set(
    key: string,
    result: NavigationBackendPathResult,
    elapsed: number,
    positiveTtlMs: number,
    negativeTtlMs: number
  ): void;
  prune(revision: number, elapsed: number): void;
  invalidate(result: NavigationObstacleUpdateResult): {
    invalidated: number;
    promoted: number;
  };
  size(): number;
  negativeSize(): number;
  clear(): void;
};

export function createNavigationPathCache(maxEntries: number): NavigationPathCache {
  const entries = new Map<string, CachedPath>();
  return {
    get(key, revision, elapsed) {
      const entry = entries.get(key);
      if (entry === undefined || entry.revision !== revision || entry.expiresAt < elapsed) {
        if (entry !== undefined) {
          entries.delete(key);
        }
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return cloneBackendPathResult(entry.result);
    },
    set(key, result, elapsed, positiveTtlMs, negativeTtlMs) {
      entries.delete(key);
      entries.set(key, {
        result: cloneBackendPathResult(result),
        revision: result.revision,
        expiresAt: elapsed + (result.status === "failed" ? negativeTtlMs : positiveTtlMs),
        negative: result.status === "failed"
      });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value as string | undefined;
        if (oldest === undefined) {
          break;
        }
        entries.delete(oldest);
      }
    },
    prune(revision, elapsed) {
      for (const [key, entry] of entries) {
        if (entry.revision !== revision || entry.expiresAt < elapsed) {
          entries.delete(key);
        }
      }
    },
    invalidate(result) {
      const invalidateAll =
        result.invalidateAllPaths === true || result.invalidatedPathDependencies === undefined;
      const invalidated = result.invalidatedPathDependencies ?? [];
      let invalidatedCount = 0;
      let promotedCount = 0;
      for (const [key, entry] of entries) {
        if (invalidateAll || dependenciesIntersect(entry.result.dependencies, invalidated)) {
          entries.delete(key);
          invalidatedCount += 1;
        } else {
          promoteResult(entry.result, result.revision);
          entry.revision = result.revision;
          promotedCount += 1;
        }
      }
      return { invalidated: invalidatedCount, promoted: promotedCount };
    },
    size: () => entries.size,
    negativeSize() {
      let count = 0;
      for (const entry of entries.values()) {
        if (entry.negative) {
          count += 1;
        }
      }
      return count;
    },
    clear: () => entries.clear()
  };
}

function dependenciesIntersect(
  dependencies: NavigationBackendPathResult["dependencies"],
  invalidated: NonNullable<NavigationObstacleUpdateResult["invalidatedPathDependencies"]>
): boolean {
  if (dependencies === undefined) {
    return true;
  }
  const keys = new Set(invalidated.map(navigationDependencyKey));
  return dependencies.some((dependency) => keys.has(navigationDependencyKey(dependency)));
}

function promoteResult(result: NavigationBackendPathResult, revision: number): void {
  result.revision = revision;
  if (result.status === "complete") {
    result.startProjection.revision = revision;
    result.goalProjection.revision = revision;
  }
  if (result.dependencies !== undefined) {
    result.dependencies = cloneNavigationDependencies(result.dependencies);
  }
}
