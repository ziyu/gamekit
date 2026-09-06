import { assertSaveEnvelope } from "./codec";
import {
  createDuplicateMigrationError,
  createMigrationError,
  createMissingMigrationError
} from "./errors";
import type { SaveEnvelope, SaveMigration, SaveMigrationRegistry, SaveVersion } from "./types";

export function createSaveMigrationRegistry(
  migrations: SaveMigration[] = []
): SaveMigrationRegistry {
  const registry = new Map<string, SaveMigration>();

  const migrationRegistry: SaveMigrationRegistry = {
    register(migration) {
      const key = migrationKey(migration.from, migration.to);
      if (registry.has(key)) {
        throw createDuplicateMigrationError(migration.from, migration.to);
      }
      registry.set(key, migration);
    },
    plan(from, to) {
      if (from === to) {
        return [];
      }

      const plan = findMigrationPlan([...registry.values()], from, to);
      if (!plan) {
        throw createMissingMigrationError(from, to);
      }

      return plan;
    },
    async migrate(envelope, to) {
      let current: SaveEnvelope = envelope;
      for (const migration of this.plan(envelope.formatVersion, to)) {
        try {
          current = await migration.migrate(current);
          assertSaveEnvelope(current);
          if (current.formatVersion !== migration.to)
            throw new Error(`Migration must produce version ${migration.to}`);
        } catch (error) {
          throw createMigrationError(migration.id, error);
        }
      }
      return current;
    },
    migrations() {
      return [...registry.values()];
    }
  };

  for (const migration of migrations) {
    migrationRegistry.register(migration);
  }

  return migrationRegistry;
}

function findMigrationPlan(
  migrations: SaveMigration[],
  from: SaveVersion,
  to: SaveVersion
): SaveMigration[] | undefined {
  const queue: Array<{ version: SaveVersion; path: SaveMigration[] }> = [
    { version: from, path: [] }
  ];
  const visited = new Set<SaveVersion>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const migration of migrations) {
      if (migration.from !== current.version || visited.has(migration.to)) {
        continue;
      }
      const path = [...current.path, migration];
      if (migration.to === to) {
        return path;
      }
      visited.add(migration.to);
      queue.push({ version: migration.to, path });
    }
  }

  return undefined;
}

function migrationKey(from: SaveVersion, to: SaveVersion): string {
  return `${from}->${to}`;
}
