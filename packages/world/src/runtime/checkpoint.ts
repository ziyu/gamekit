import type { ComponentDef } from "../components/component";
import type { EntityId, GameWorld } from "./types";

export type CheckpointGameWorld = GameWorld & {
  spawnWithId(entityId: EntityId): EntityId;
};

export type WorldCheckpointComponent<TComponent extends object = object, TCheckpoint = unknown> = {
  component: ComponentDef<TComponent>;
  capture(value: TComponent): TCheckpoint;
  restore(checkpoint: TCheckpoint): Partial<TComponent>;
  validate?(checkpoint: TCheckpoint): boolean | undefined;
};

export type WorldCheckpointComponentInput = ComponentDef<any> | WorldCheckpointComponent<any, any>;

export type WorldCheckpointComponentValue = {
  componentId: string;
  value: unknown;
};

export type WorldEntityCheckpoint = {
  entityId: EntityId;
  components: WorldCheckpointComponentValue[];
};

export type WorldRuntimeCheckpoint = {
  version: 1;
  componentIds: string[];
  entities: WorldEntityCheckpoint[];
};

export type WorldCheckpointValidationIssue = {
  code:
    | "invalid-checkpoint"
    | "invalid-version"
    | "component-schema-mismatch"
    | "invalid-entity"
    | "invalid-entity-id"
    | "duplicate-entity"
    | "invalid-components"
    | "unknown-component"
    | "duplicate-component"
    | "invalid-component";
  path: string;
  message: string;
};

export type WorldCheckpointValidationResult = {
  valid: boolean;
  issues: WorldCheckpointValidationIssue[];
};

export type WorldCheckpointRestoreResult = {
  restoredEntities: number;
  spawnedEntities: number;
  despawnedEntities: number;
};

export type WorldCheckpointController = {
  capture(): WorldRuntimeCheckpoint;
  validate(checkpoint: WorldRuntimeCheckpoint): WorldCheckpointValidationResult;
  restore(checkpoint: WorldRuntimeCheckpoint): WorldCheckpointRestoreResult;
};

export type CreateWorldCheckpointControllerOptions = {
  world: CheckpointGameWorld;
  components: readonly WorldCheckpointComponentInput[];
  selectEntities(): Iterable<EntityId>;
};

export function createWorldCheckpointController(
  options: CreateWorldCheckpointControllerOptions
): WorldCheckpointController {
  const components = normalizeComponents(options.components);
  const componentIds = components.map((entry) => entry.component.id);
  const componentById = new Map(components.map((entry) => [entry.component.id, entry]));

  return {
    capture() {
      const entityIds = selectedEntityIds(options);
      return {
        version: 1,
        componentIds: [...componentIds],
        entities: entityIds.map((entityId) => ({
          entityId,
          components: components.flatMap((entry) => {
            const value = options.world.get(entityId, entry.component);
            return value === undefined
              ? []
              : [{ componentId: entry.component.id, value: entry.capture(value) }];
          })
        }))
      };
    },
    validate(checkpoint) {
      return validateWorldCheckpoint(checkpoint, componentIds, componentById);
    },
    restore(checkpoint) {
      const validation = validateWorldCheckpoint(checkpoint, componentIds, componentById);
      if (!validation.valid) {
        throw new Error(
          `World checkpoint is invalid: ${validation.issues.map((issue) => issue.code).join(", ")}`
        );
      }

      const checkpointIds = new Set(checkpoint.entities.map((entry) => entry.entityId));
      const currentIds = selectedEntityIds(options);
      let despawnedEntities = 0;
      for (const entityId of currentIds) {
        if (checkpointIds.has(entityId)) {
          continue;
        }
        options.world.despawn(entityId);
        despawnedEntities += 1;
      }

      let spawnedEntities = 0;
      for (const entry of checkpoint.entities) {
        if (!options.world.has(entry.entityId)) {
          const spawnedId = options.world.spawnWithId(entry.entityId);
          if (spawnedId !== entry.entityId) {
            throw new Error(
              `Checkpoint world did not preserve entity id: ${String(entry.entityId)}`
            );
          }
          spawnedEntities += 1;
        }
        const valueByComponentId = new Map(
          entry.components.map((component) => [component.componentId, component.value])
        );
        for (const componentEntry of components) {
          const component = componentEntry.component;
          const hasCheckpointValue = valueByComponentId.has(component.id);
          if (options.world.get(entry.entityId, component) !== undefined) {
            options.world.remove(entry.entityId, component);
          }
          if (hasCheckpointValue) {
            const checkpointValue = valueByComponentId.get(component.id);
            options.world.add(entry.entityId, component, componentEntry.restore(checkpointValue));
          }
        }
      }
      return {
        restoredEntities: checkpoint.entities.length,
        spawnedEntities,
        despawnedEntities
      };
    }
  };
}

export function defineWorldCheckpointComponent<TComponent extends object, TCheckpoint>(
  input: WorldCheckpointComponent<TComponent, TCheckpoint>
): WorldCheckpointComponent<TComponent, TCheckpoint> {
  return input;
}

export function isCheckpointGameWorld(world: GameWorld): world is CheckpointGameWorld {
  return "spawnWithId" in world && typeof world.spawnWithId === "function";
}

function normalizeComponents(
  inputs: readonly WorldCheckpointComponentInput[]
): WorldCheckpointComponent<any, any>[] {
  if (inputs.length === 0) {
    throw new Error("World checkpoint requires at least one component.");
  }
  const ids = new Set<string>();
  return inputs.map((input) => {
    const entry = "component" in input ? input : defaultCheckpointComponent(input);
    if (entry.component.id.trim().length === 0) {
      throw new Error("World checkpoint component id must not be empty.");
    }
    if (ids.has(entry.component.id)) {
      throw new Error(`Duplicate World checkpoint component: ${entry.component.id}`);
    }
    ids.add(entry.component.id);
    return entry;
  });
}

function defaultCheckpointComponent<TComponent extends object>(
  component: ComponentDef<TComponent>
): WorldCheckpointComponent<TComponent, TComponent> {
  return {
    component,
    capture: (value) => structuredClone(value),
    restore: (checkpoint) => structuredClone(checkpoint),
    validate: (checkpoint) => checkpoint !== null && typeof checkpoint === "object"
  };
}

function selectedEntityIds(options: CreateWorldCheckpointControllerOptions): EntityId[] {
  const ids = new Set<EntityId>();
  for (const entityId of options.selectEntities()) {
    if (!validEntityId(entityId)) {
      throw new Error(`World checkpoint selected an invalid entity id: ${String(entityId)}`);
    }
    if (!options.world.has(entityId)) {
      throw new Error(`World checkpoint selected a missing entity: ${String(entityId)}`);
    }
    if (ids.has(entityId)) {
      throw new Error(`World checkpoint selected a duplicate entity: ${String(entityId)}`);
    }
    ids.add(entityId);
  }
  return [...ids].sort(compareEntityIds);
}

function validateWorldCheckpoint(
  checkpoint: WorldRuntimeCheckpoint,
  componentIds: readonly string[],
  componentById: Map<string, WorldCheckpointComponent<any, any>>
): WorldCheckpointValidationResult {
  const issues: WorldCheckpointValidationIssue[] = [];
  const input: unknown = checkpoint;
  if (!isRecord(input)) {
    issues.push({
      code: "invalid-checkpoint",
      path: "",
      message: "World checkpoint must be an object."
    });
    return { valid: false, issues };
  }
  if (input.version !== 1) {
    issues.push({
      code: "invalid-version",
      path: "version",
      message: "World checkpoint version must be 1."
    });
  }
  const checkpointComponentIds = input.componentIds;
  if (
    !Array.isArray(checkpointComponentIds) ||
    checkpointComponentIds.length !== componentIds.length ||
    checkpointComponentIds.some((id, index) => id !== componentIds[index])
  ) {
    issues.push({
      code: "component-schema-mismatch",
      path: "componentIds",
      message: "World checkpoint component schema does not match the controller."
    });
  }

  const checkpointEntities = input.entities;
  if (!Array.isArray(checkpointEntities)) {
    issues.push({
      code: "invalid-checkpoint",
      path: "entities",
      message: "World checkpoint entities must be an array."
    });
    return { valid: false, issues };
  }

  const entityIds = new Set<EntityId>();
  for (let entityIndex = 0; entityIndex < checkpointEntities.length; entityIndex += 1) {
    const entity = checkpointEntities[entityIndex];
    const entityPath = `entities[${entityIndex}]`;
    if (!isRecord(entity)) {
      issues.push({
        code: "invalid-entity",
        path: entityPath,
        message: "World checkpoint entity must be an object."
      });
      continue;
    }
    const entityId = entity.entityId;
    if (!validEntityId(entityId)) {
      issues.push({
        code: "invalid-entity-id",
        path: `${entityPath}.entityId`,
        message: "World checkpoint entity id must be a non-empty string or safe integer."
      });
    } else if (entityIds.has(entityId)) {
      issues.push({
        code: "duplicate-entity",
        path: `${entityPath}.entityId`,
        message: `Duplicate World checkpoint entity: ${String(entityId)}`
      });
    } else {
      entityIds.add(entityId);
    }

    const entityComponents = entity.components;
    if (!Array.isArray(entityComponents)) {
      issues.push({
        code: "invalid-components",
        path: `${entityPath}.components`,
        message: "World checkpoint entity components must be an array."
      });
      continue;
    }
    const seenComponents = new Set<string>();
    for (let componentIndex = 0; componentIndex < entityComponents.length; componentIndex += 1) {
      const value = entityComponents[componentIndex];
      const componentPath = `${entityPath}.components[${componentIndex}]`;
      if (!isRecord(value) || typeof value.componentId !== "string") {
        issues.push({
          code: "invalid-component",
          path: componentPath,
          message: "World checkpoint component must contain a string component id."
        });
        continue;
      }
      const checkpointComponentId = value.componentId;
      const component = componentById.get(checkpointComponentId);
      if (component === undefined) {
        issues.push({
          code: "unknown-component",
          path: `${componentPath}.componentId`,
          message: `Unknown World checkpoint component: ${checkpointComponentId}`
        });
        continue;
      }
      if (seenComponents.has(checkpointComponentId)) {
        issues.push({
          code: "duplicate-component",
          path: `${componentPath}.componentId`,
          message: `Duplicate World checkpoint component: ${checkpointComponentId}`
        });
        continue;
      }
      seenComponents.add(checkpointComponentId);
      try {
        if (component.validate?.(value.value) === false) {
          issues.push({
            code: "invalid-component",
            path: `${componentPath}.value`,
            message: `Invalid World checkpoint component value: ${checkpointComponentId}`
          });
        }
      } catch {
        issues.push({
          code: "invalid-component",
          path: `${componentPath}.value`,
          message: `World checkpoint component validation failed: ${checkpointComponentId}`
        });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function validEntityId(entityId: unknown): entityId is EntityId {
  return (
    (typeof entityId === "string" && entityId.trim().length > 0) ||
    (typeof entityId === "number" && Number.isSafeInteger(entityId))
  );
}

function compareEntityIds(left: EntityId, right: EntityId): number {
  if (typeof left !== typeof right) {
    return typeof left === "number" ? -1 : 1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
