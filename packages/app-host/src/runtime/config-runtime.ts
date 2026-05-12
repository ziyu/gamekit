import { createMissingConfigError } from "./errors";
import type { AppConfigEntry, AppConfigRuntime, AppConfigSource } from "./types";

export function createAppConfigRuntime(sources: AppConfigSource[] = []): AppConfigRuntime {
  const orderedSources = [...sources].sort((a, b) => a.priority - b.priority);
  const overrides: AppConfigSource[] = [];

  const resolveEntries = (): Map<string, AppConfigEntry> => {
    const entries = new Map<string, AppConfigEntry>();
    for (const source of [...orderedSources, ...overrides]) {
      for (const [path, value] of flattenConfig(source.values)) {
        entries.set(path, {
          path,
          value,
          source: source.id
        });
      }
    }

    return entries;
  };

  return {
    get<T = unknown>(path: string): T | undefined {
      return resolveEntries().get(path)?.value as T | undefined;
    },
    require<T = unknown>(path: string): T {
      const value = this.get<T>(path);
      if (value === undefined) {
        throw createMissingConfigError(path);
      }

      return value;
    },
    setOverride(path, value, source) {
      overrides.push({
        id: source,
        priority: Number.MAX_SAFE_INTEGER,
        values: setConfigPath({}, path, value)
      });
    },
    snapshot() {
      return {
        sources: [...orderedSources, ...overrides].map((source) => ({
          id: source.id,
          priority: source.priority
        })),
        entries: [...resolveEntries().values()].sort((a, b) => a.path.localeCompare(b.path))
      };
    }
  };
}

function flattenConfig(
  values: Record<string, unknown>,
  prefix = ""
): Array<[path: string, value: unknown]> {
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(values)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      entries.push(...flattenConfig(value, path));
    } else {
      entries.push([path, value]);
    }
  }

  return entries;
}

function setConfigPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = target;
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      cursor[part] = value;
      break;
    }

    const next = cursor[part];
    if (!isRecord(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }

  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
