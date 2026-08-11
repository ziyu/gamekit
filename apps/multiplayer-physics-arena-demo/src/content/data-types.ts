import type {
  DataDiagnostic,
  DataDocument,
  DataReferenceTarget,
  DataTypeDefinition
} from "@gamekit/data";
import {
  ARENA_BOT_ARCHETYPE_TYPE,
  ARENA_COURSE_TYPE,
  ARENA_HAZARD_TYPE,
  ARENA_ITEM_TYPE,
  ARENA_MATCH_RULE_TYPE,
  ARENA_MOTOR_PROFILE_TYPE,
  ARENA_SPAWN_SET_TYPE,
  ARENA_STAGE_TYPE,
  type ArenaBotArchetypeDefinition,
  type ArenaCourseDefinition,
  type ArenaHazardDefinition,
  type ArenaItemDefinition,
  type ArenaMatchRuleDefinition,
  type ArenaMotorProfileDefinition,
  type ArenaSpawnSetDefinition,
  type ArenaStageDefinition
} from "./types";

export function createArenaDataTypes(): Array<DataTypeDefinition<any>> {
  return [
    matchRuleDataType(),
    stageDataType(),
    courseDataType(),
    hazardDataType(),
    itemDataType(),
    motorProfileDataType(),
    botArchetypeDataType(),
    spawnSetDataType()
  ];
}

function matchRuleDataType(): DataTypeDefinition<ArenaMatchRuleDefinition> {
  return {
    type: ARENA_MATCH_RULE_TYPE,
    getTags: () => ["arena", "match"],
    references: (document) =>
      document.data.stages.map((stage, index) => ref(stage, `stages[${index}]`)),
    validate(document) {
      return [
        ...matchingId(document),
        ...positiveInteger(document, document.data.participantCount, "participantCount"),
        ...nonEmpty(document, document.data.stages, "stages"),
        ...uniqueRefs(document, document.data.stages, "stages")
      ];
    }
  };
}

function stageDataType(): DataTypeDefinition<ArenaStageDefinition> {
  return {
    type: ARENA_STAGE_TYPE,
    getTags: (stage) => ["arena", "stage", stage.kind],
    references(document) {
      return [
        ref(document.data.course, "course"),
        ...document.data.itemPool.map((item, index) => ref(item, `itemPool[${index}]`)),
        ...document.data.botArchetypes.map((bot, index) => ref(bot, `botArchetypes[${index}]`))
      ];
    },
    validate(document) {
      return [
        ...matchingId(document),
        ...positiveInteger(document, document.data.qualificationCount, "qualificationCount"),
        ...positiveInteger(document, document.data.durationTicks, "durationTicks"),
        ...uniqueRefs(document, document.data.itemPool, "itemPool"),
        ...uniqueRefs(document, document.data.botArchetypes, "botArchetypes")
      ];
    }
  };
}

function courseDataType(): DataTypeDefinition<ArenaCourseDefinition> {
  return {
    type: ARENA_COURSE_TYPE,
    getTags: () => ["arena", "course"],
    references(document) {
      return [
        ref(document.data.spawnSet, "spawnSet"),
        ...document.data.hazards.map((hazard, index) => ref(hazard, `hazards[${index}]`))
      ];
    },
    validate(document) {
      return [
        ...matchingId(document),
        ...nonBlank(document, document.data.definitionVersion, "definitionVersion"),
        ...uniqueRefs(document, document.data.hazards, "hazards")
      ];
    }
  };
}

function hazardDataType(): DataTypeDefinition<ArenaHazardDefinition> {
  return {
    type: ARENA_HAZARD_TYPE,
    getTags: (hazard) => ["arena", "hazard", hazard.kind],
    validate(document) {
      const schedule = document.data.schedule;
      return [
        ...matchingId(document),
        ...positiveInteger(document, schedule.periodTicks, "schedule.periodTicks"),
        ...nonNegativeInteger(document, schedule.phaseTicks, "schedule.phaseTicks"),
        ...positiveInteger(document, schedule.activeTicks, "schedule.activeTicks"),
        ...(schedule.activeTicks <= schedule.periodTicks
          ? []
          : [
              diagnostic(
                document,
                "arena.hazard_active_window",
                "schedule.activeTicks must not exceed schedule.periodTicks",
                "schedule.activeTicks"
              )
            ])
      ];
    }
  };
}

function itemDataType(): DataTypeDefinition<ArenaItemDefinition> {
  return {
    type: ARENA_ITEM_TYPE,
    getTags: (item) => ["arena", "item", item.kind],
    validate(document) {
      return [
        ...matchingId(document),
        ...positive(document, document.data.mass, "mass"),
        ...ratio(document, document.data.carrySpeedMultiplier, "carrySpeedMultiplier"),
        ...nonNegativeInteger(document, document.data.windupTicks, "windupTicks"),
        ...nonNegativeInteger(document, document.data.cooldownTicks, "cooldownTicks"),
        ...nonNegativeInteger(document, document.data.respawnTicks, "respawnTicks")
      ];
    }
  };
}

function motorProfileDataType(): DataTypeDefinition<ArenaMotorProfileDefinition> {
  return {
    type: ARENA_MOTOR_PROFILE_TYPE,
    getTags: () => ["arena", "motor"],
    validate(document) {
      return [
        ...matchingId(document),
        ...positive(document, document.data.maxGroundSpeed, "maxGroundSpeed"),
        ...positive(document, document.data.groundAcceleration, "groundAcceleration"),
        ...positive(document, document.data.groundBraking, "groundBraking"),
        ...positive(document, document.data.airAcceleration, "airAcceleration"),
        ...positive(document, document.data.jumpSpeed, "jumpSpeed"),
        ...positive(document, document.data.diveSpeed, "diveSpeed"),
        ...nonNegativeInteger(document, document.data.coyoteTicks, "coyoteTicks"),
        ...nonNegativeInteger(document, document.data.jumpBufferTicks, "jumpBufferTicks")
      ];
    }
  };
}

function botArchetypeDataType(): DataTypeDefinition<ArenaBotArchetypeDefinition> {
  return {
    type: ARENA_BOT_ARCHETYPE_TYPE,
    getTags: () => ["arena", "bot"],
    references(document) {
      return [
        ref(document.data.motor, "motor"),
        ...document.data.preferredItems.map((item, index) => ref(item, `preferredItems[${index}]`))
      ];
    },
    validate(document) {
      return [
        ...matchingId(document),
        ...nonNegativeInteger(document, document.data.reactionTicks, "reactionTicks"),
        ...nonNegative(document, document.data.aimErrorRadians, "aimErrorRadians"),
        ...ratio(document, document.data.aggression, "aggression"),
        ...ratio(document, document.data.riskTolerance, "riskTolerance"),
        ...uniqueRefs(document, document.data.preferredItems, "preferredItems")
      ];
    }
  };
}

function spawnSetDataType(): DataTypeDefinition<ArenaSpawnSetDefinition> {
  return {
    type: ARENA_SPAWN_SET_TYPE,
    getTags: () => ["arena", "spawn-set"],
    references(document) {
      return document.data.points.flatMap((point, index) =>
        point.definition === undefined ? [] : [ref(point.definition, `points[${index}].definition`)]
      );
    },
    validate(document) {
      const pointIds = new Set<string>();
      const diagnostics = [
        ...matchingId(document),
        ...nonEmpty(document, document.data.points, "points")
      ];
      for (const [index, point] of document.data.points.entries()) {
        const path = `points[${index}]`;
        if (pointIds.has(point.id)) {
          diagnostics.push(
            diagnostic(
              document,
              "arena.spawn_duplicate_id",
              `Duplicate spawn id: ${point.id}`,
              path
            )
          );
        }
        pointIds.add(point.id);
        diagnostics.push(...nonBlank(document, point.id, `${path}.id`));
        for (const axis of ["x", "y", "z"] as const) {
          const value = point.position[axis] ?? (axis === "z" ? 0 : undefined);
          if (value === undefined || !Number.isFinite(value)) {
            diagnostics.push(
              diagnostic(
                document,
                "arena.spawn_non_finite_position",
                `${path}.position.${axis} must be finite`,
                `${path}.position.${axis}`
              )
            );
          }
        }
        if (point.kind === "participant" && point.definition !== undefined) {
          diagnostics.push(
            diagnostic(
              document,
              "arena.spawn_participant_definition",
              "Participant spawns must not bind a content definition",
              `${path}.definition`
            )
          );
        }
        if (point.kind !== "participant" && point.definition === undefined) {
          diagnostics.push(
            diagnostic(
              document,
              "arena.spawn_missing_definition",
              `${point.kind} spawns require a content definition`,
              `${path}.definition`
            )
          );
        }
      }
      return diagnostics;
    }
  };
}

function matchingId<T extends { id: string }>(document: DataDocument<T>): DataDiagnostic[] {
  return document.data.id === document.id
    ? []
    : [
        diagnostic(
          document,
          "arena.data_id_mismatch",
          `Data id ${document.data.id} must match document id ${document.id}`,
          "id"
        )
      ];
}

function ref(reference: { type: string; id: string }, path: string): DataReferenceTarget {
  return { type: reference.type, id: reference.id, path };
}

function uniqueRefs(
  document: DataDocument<unknown>,
  references: ReadonlyArray<{ type: string; id: string }>,
  path: string
): DataDiagnostic[] {
  const seen = new Set<string>();
  const diagnostics: DataDiagnostic[] = [];
  for (const [index, reference] of references.entries()) {
    const key = `${reference.type}:${reference.id}`;
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(
          document,
          "arena.data_duplicate_reference",
          `Duplicate reference: ${key}`,
          `${path}[${index}]`
        )
      );
    }
    seen.add(key);
  }
  return diagnostics;
}

function nonEmpty(
  document: DataDocument<unknown>,
  values: readonly unknown[],
  path: string
): DataDiagnostic[] {
  return values.length > 0
    ? []
    : [diagnostic(document, "arena.data_empty_collection", `${path} must not be empty`, path)];
}

function nonBlank(document: DataDocument<unknown>, value: string, path: string): DataDiagnostic[] {
  return value.trim().length > 0
    ? []
    : [diagnostic(document, "arena.data_blank_string", `${path} must not be blank`, path)];
}

function positive(document: DataDocument<unknown>, value: number, path: string): DataDiagnostic[] {
  return Number.isFinite(value) && value > 0
    ? []
    : [diagnostic(document, "arena.data_positive_number", `${path} must be positive`, path)];
}

function nonNegative(
  document: DataDocument<unknown>,
  value: number,
  path: string
): DataDiagnostic[] {
  return Number.isFinite(value) && value >= 0
    ? []
    : [
        diagnostic(document, "arena.data_non_negative_number", `${path} must be non-negative`, path)
      ];
}

function ratio(document: DataDocument<unknown>, value: number, path: string): DataDiagnostic[] {
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? []
    : [diagnostic(document, "arena.data_ratio", `${path} must be between 0 and 1`, path)];
}

function positiveInteger(
  document: DataDocument<unknown>,
  value: number,
  path: string
): DataDiagnostic[] {
  return Number.isSafeInteger(value) && value > 0
    ? []
    : [
        diagnostic(
          document,
          "arena.data_positive_integer",
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
  return Number.isSafeInteger(value) && value >= 0
    ? []
    : [
        diagnostic(
          document,
          "arena.data_non_negative_integer",
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
