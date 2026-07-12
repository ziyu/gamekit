import type {
  DataDiagnostic,
  DataDocument,
  DataReferenceTarget,
  DataTypeDefinition
} from "@gamekit/data";
import {
  OUTPOST_BUILDABLE_TYPE,
  OUTPOST_ENEMY_TYPE,
  OUTPOST_OBJECTIVE_TYPE,
  OUTPOST_PLAYER_TYPE,
  OUTPOST_RENDER_OBJECT_TYPE,
  OUTPOST_WAVE_TYPE,
  OUTPOST_WEAPON_TYPE,
  type OutpostBuildableDefinition,
  type OutpostEnemyDefinition,
  type OutpostObjectiveDefinition,
  type OutpostPlayerDefinition,
  type OutpostRenderObjectDefinition,
  type OutpostWaveDefinition,
  type OutpostWeaponDefinition
} from "../domain";

export function createOutpostDataTypes(): Array<DataTypeDefinition<any>> {
  return [
    createOutpostPlayerDataType(),
    createOutpostEnemyDataType(),
    createOutpostWeaponDataType(),
    createOutpostBuildableDataType(),
    createOutpostWaveDataType(),
    createOutpostObjectiveDataType(),
    createOutpostRenderObjectDataType()
  ];
}

export function createOutpostPlayerDataType(): DataTypeDefinition<OutpostPlayerDefinition> {
  return {
    type: OUTPOST_PLAYER_TYPE,
    getTags: () => ["outpost", "player"],
    references(document) {
      return [
        dataRef(document.data.actor, "actor"),
        dataRef(document.data.weapon, "weapon"),
        dataRef(document.data.physicsBody, "physicsBody"),
        dataRef(document.data.renderObject, "renderObject")
      ];
    },
    indexes: [index("outpost.player.weapon", (document) => document.data.weapon.id)],
    validate(document) {
      return [...matchingId(document), ...positive(document, document.data.moveSpeed, "moveSpeed")];
    }
  };
}

export function createOutpostEnemyDataType(): DataTypeDefinition<OutpostEnemyDefinition> {
  return {
    type: OUTPOST_ENEMY_TYPE,
    getTags: (enemy) => ["outpost", "enemy", enemy.role],
    references(document) {
      return [
        dataRef(document.data.actor, "actor"),
        dataRef(document.data.attackAbility, "attackAbility"),
        dataRef(document.data.physicsBody, "physicsBody"),
        dataRef(document.data.renderObject, "renderObject")
      ];
    },
    indexes: [index("outpost.enemy.role", (document) => document.data.role)],
    validate(document) {
      return [...matchingId(document), ...positive(document, document.data.moveSpeed, "moveSpeed")];
    }
  };
}

export function createOutpostWeaponDataType(): DataTypeDefinition<OutpostWeaponDefinition> {
  return {
    type: OUTPOST_WEAPON_TYPE,
    getTags: () => ["outpost", "weapon"],
    references(document) {
      return [
        dataRef(document.data.ability, "ability"),
        dataRef(document.data.projectileBody, "projectileBody"),
        dataRef(document.data.projectileRenderObject, "projectileRenderObject")
      ];
    },
    validate(document) {
      return [
        ...matchingId(document),
        ...positive(document, document.data.fireIntervalMs, "fireIntervalMs")
      ];
    }
  };
}

export function createOutpostBuildableDataType(): DataTypeDefinition<OutpostBuildableDefinition> {
  return {
    type: OUTPOST_BUILDABLE_TYPE,
    getTags: () => ["outpost", "buildable"],
    references(document) {
      return [
        dataRef(document.data.actor, "actor"),
        dataRef(document.data.deployAbility, "deployAbility"),
        dataRef(document.data.physicsBody, "physicsBody"),
        dataRef(document.data.renderObject, "renderObject")
      ];
    },
    validate(document) {
      return [
        ...matchingId(document),
        ...nonNegative(document, document.data.resourceCost, "resourceCost")
      ];
    }
  };
}

export function createOutpostWaveDataType(): DataTypeDefinition<OutpostWaveDefinition> {
  return {
    type: OUTPOST_WAVE_TYPE,
    getTags: (wave) => ["outpost", "wave", wave.boss === undefined ? "standard" : "boss"],
    references(document) {
      return [
        dataRef(document.data.objective, "objective"),
        ...document.data.spawns.map((spawn, spawnIndex) =>
          dataRef(spawn.enemy, `spawns[${spawnIndex}].enemy`)
        ),
        ...(document.data.boss === undefined ? [] : [dataRef(document.data.boss, "boss")])
      ];
    },
    indexes: [index("outpost.wave.index", (document) => String(document.data.index))],
    validate(document) {
      return [
        ...matchingId(document),
        ...nonNegativeInteger(document, document.data.index, "index"),
        ...(document.data.spawns.length === 0 && document.data.boss === undefined
          ? [diagnostic(document, "outpost.wave_empty", "Wave requires a spawn or boss", "spawns")]
          : []),
        ...document.data.spawns.flatMap((spawn, spawnIndex) =>
          positiveInteger(document, spawn.count, `spawns[${spawnIndex}].count`)
        )
      ];
    }
  };
}

export function createOutpostObjectiveDataType(): DataTypeDefinition<OutpostObjectiveDefinition> {
  return {
    type: OUTPOST_OBJECTIVE_TYPE,
    getTags: (objective) => ["outpost", "objective", objective.kind],
    indexes: [index("outpost.objective.kind", (document) => document.data.kind)],
    validate(document) {
      const diagnostics = matchingId(document);
      if (document.data.kind === "eliminate") {
        diagnostics.push(...positiveInteger(document, document.data.targetCount, "targetCount"));
      }
      if (document.data.kind === "defend" || document.data.kind === "extract") {
        diagnostics.push(...positive(document, document.data.durationMs, "durationMs"));
      }
      return diagnostics;
    }
  };
}

export function createOutpostRenderObjectDataType(): DataTypeDefinition<OutpostRenderObjectDefinition> {
  return {
    type: OUTPOST_RENDER_OBJECT_TYPE,
    getTags: (renderObject) => ["outpost", "render", ...(renderObject.tags ?? [])],
    references(document) {
      return Object.entries(document.data.assetRefs).map(([slot, asset]) => ({
        type: "asset.definition",
        id: asset.assetId,
        path: `assetRefs.${slot}`
      }));
    },
    validate(document) {
      return [
        ...matchingId(document),
        ...(document.data.type.length === 0
          ? [
              diagnostic(
                document,
                "outpost.render_missing_type",
                "Render object requires type",
                "type"
              )
            ]
          : []),
        ...(Object.keys(document.data.assetRefs).length === 0
          ? [
              diagnostic(
                document,
                "outpost.render_missing_assets",
                "Render object requires at least one AssetRef",
                "assetRefs"
              )
            ]
          : [])
      ];
    }
  };
}

function matchingId<TData extends { id: string }>(document: DataDocument<TData>): DataDiagnostic[] {
  return document.data.id === document.id
    ? []
    : [
        diagnostic(
          document,
          "outpost.data_id_mismatch",
          `Data id ${document.data.id} must match document id ${document.id}`,
          "id"
        )
      ];
}

function dataRef(reference: { type: string; id: string }, path: string): DataReferenceTarget {
  return { type: reference.type, id: reference.id, path };
}

function index<TData>(
  id: string,
  value: (document: DataDocument<TData>) => string
): { id: string; values(document: DataDocument<TData>): string[] } {
  return { id, values: (document) => [value(document)] };
}

function positive(
  document: DataDocument<unknown>,
  value: number | undefined,
  path: string
): DataDiagnostic[] {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? []
    : [diagnostic(document, "outpost.data_positive_number", `${path} must be positive`, path)];
}

function nonNegative(
  document: DataDocument<unknown>,
  value: number,
  path: string
): DataDiagnostic[] {
  return Number.isFinite(value) && value >= 0
    ? []
    : [
        diagnostic(
          document,
          "outpost.data_non_negative_number",
          `${path} must be non-negative`,
          path
        )
      ];
}

function positiveInteger(
  document: DataDocument<unknown>,
  value: number | undefined,
  path: string
): DataDiagnostic[] {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? []
    : [
        diagnostic(
          document,
          "outpost.data_positive_integer",
          `${path} must be a positive integer`,
          path
        )
      ];
}

function nonNegativeInteger(
  document: DataDocument<unknown>,
  value: number,
  path: string
): DataDiagnostic[] {
  return Number.isInteger(value) && value >= 0
    ? []
    : [
        diagnostic(
          document,
          "outpost.data_non_negative_integer",
          `${path} must be a non-negative integer`,
          path
        )
      ];
}

function diagnostic(
  document: DataDocument<unknown>,
  code: string,
  message: string,
  path: string
): DataDiagnostic {
  return {
    code,
    message,
    severity: "error",
    key: { type: document.type, id: document.id },
    path,
    ...(document.sourcePackId === undefined ? {} : { sourcePackId: document.sourcePackId })
  };
}
