import { createAssetDataType } from "@gamekit/asset";
import { createDataRegistry, type DataPack, type DataRegistry } from "@gamekit/data";
import { createGasDataTypes } from "@gamekit/gas";
import type { RenderObjectDefinition } from "@gamekit/renderer-core";
import { createTcaRuleDataType } from "@gamekit/tca";
import { sandboxCoreEntries } from "./content/core";
import { sandboxObjectiveEntries } from "./content/objectives";
import { sandboxScoutEntries } from "./content/scouts";
import {
  SANDBOX_ACTOR_ID,
  SANDBOX_ENTITY_RENDER_OBJECT_ID,
  SANDBOX_ENTITY_RENDER_RIG_ID,
  SANDBOX_SIGNAL_OUTPOST_LAYOUT_ID,
  createAbilityDataType,
  createActorDataType,
  createBiomeDataType,
  createObjectivePhaseDataType,
  createOutpostRouteDataType,
  createProductionRecipeDataType,
  createRenderObjectDataType,
  createRenderRigDataType,
  createSceneLayoutDataType,
  createSceneObjectDataType,
  createSpawnProfileDataType,
  createStationDataType,
  createThreatProfileDataType,
  type SandboxActorDefinition,
  type SandboxObjectivePhaseDefinition,
  type SandboxRenderRigDefinition,
  type SandboxSceneLayoutDefinition,
  type SandboxSceneObjectDefinition,
  type SandboxStationDefinition
} from "./content/source";
import { sandboxStationEntries } from "./content/stations";
import { sandboxThreatEntries } from "./content/threats";
import { sandboxVisualEntries } from "./content/visuals";

export * from "./content/source";

export const sandboxDataPack: DataPack = {
  id: "sandbox.base",
  version: "1.0.0",
  namespace: "sandbox",
  entries: [
    ...sandboxCoreEntries,
    ...sandboxStationEntries,
    ...sandboxScoutEntries,
    ...sandboxThreatEntries,
    ...sandboxObjectiveEntries,
    ...sandboxVisualEntries
  ]
};

export function createSandboxDataRegistry(): DataRegistry {
  const registry = createDataRegistry();
  registry.registerType(createAssetDataType({ supportedTypes: ["image", "spritesheet"] }));
  registry.registerType(createRenderObjectDataType(["debug.square", "sprite", "container"]));
  registry.registerType(createRenderRigDataType());
  registry.registerType(createSceneObjectDataType());
  registry.registerType(createStationDataType());
  registry.registerType(createProductionRecipeDataType());
  registry.registerType(createObjectivePhaseDataType());
  registry.registerType(createThreatProfileDataType());
  registry.registerType(createOutpostRouteDataType());
  registry.registerType(createSceneLayoutDataType());
  registry.registerType(createActorDataType());
  registry.registerType(createAbilityDataType());
  for (const type of createGasDataTypes()) {
    registry.registerType(type);
  }
  registry.registerType(createBiomeDataType());
  registry.registerType(createSpawnProfileDataType());
  registry.registerType(createTcaRuleDataType());
  registry.registerPack(sandboxDataPack);
  return registry;
}

export function getSandboxActorDefinition(registry: DataRegistry): SandboxActorDefinition {
  return registry.getValue<SandboxActorDefinition>("sandbox.actor", SANDBOX_ACTOR_ID);
}

export function getSandboxRenderRigDefinition(registry: DataRegistry): SandboxRenderRigDefinition {
  return registry.getValue<SandboxRenderRigDefinition>(
    "sandbox.renderRig",
    SANDBOX_ENTITY_RENDER_RIG_ID
  );
}

export function getSandboxEntityRenderObject(registry: DataRegistry): RenderObjectDefinition {
  return registry.getValue<RenderObjectDefinition>(
    "render.object",
    SANDBOX_ENTITY_RENDER_OBJECT_ID
  );
}

export function getSandboxSignalOutpostLayout(
  registry: DataRegistry
): SandboxSceneLayoutDefinition {
  return registry.getValue<SandboxSceneLayoutDefinition>(
    "sandbox.sceneLayout",
    SANDBOX_SIGNAL_OUTPOST_LAYOUT_ID
  );
}

export function getSandboxSceneObjects(
  registry: DataRegistry,
  layout: SandboxSceneLayoutDefinition
): SandboxSceneObjectDefinition[] {
  return layout.objectIds.map((id) =>
    registry.getValue<SandboxSceneObjectDefinition>("sandbox.sceneObject", id)
  );
}

export function getSandboxRenderObject(registry: DataRegistry, id: string): RenderObjectDefinition {
  return registry.getValue<RenderObjectDefinition>("render.object", id);
}

export function getSandboxRenderRig(
  registry: DataRegistry,
  id: string
): SandboxRenderRigDefinition {
  return registry.getValue<SandboxRenderRigDefinition>("sandbox.renderRig", id);
}

export function getSandboxStationDefinition(
  registry: DataRegistry,
  id: string
): SandboxStationDefinition {
  return registry.getValue<SandboxStationDefinition>("sandbox.station", id);
}

export function getSandboxObjectivePhase(
  registry: DataRegistry,
  id: string
): SandboxObjectivePhaseDefinition {
  return registry.getValue<SandboxObjectivePhaseDefinition>("sandbox.objectivePhase", id);
}
