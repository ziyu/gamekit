import { createAssetDataType } from "@gamekit/asset";
import {
  createDataRegistry,
  type DataPack,
  type DataRegistry,
  type DataTypeDefinition
} from "@gamekit/data";
import { createGasDataTypes } from "@gamekit/gas";
import { createPhysicsDataTypes } from "@gamekit/physics-core";
import { createTcaRuleDataType } from "@gamekit/tca";
import { createOutpostDataTypes } from "./data-types";
import { outpostContentPack } from "./pack";

export type CreateOutpostDataRegistryOptions = {
  packs?: DataPack[] | undefined;
};

export function createOutpostDataRegistry(
  options: CreateOutpostDataRegistryOptions = {}
): DataRegistry {
  const registry = createDataRegistry();
  registerOutpostDataTypes(registry);
  for (const pack of options.packs ?? [outpostContentPack]) {
    registry.registerPack(pack);
  }
  return registry;
}

export function createAllOutpostDataTypes(): Array<DataTypeDefinition<any>> {
  return [
    createAssetDataType({ supportedTypes: ["image"], supportedSources: ["url"] }),
    ...createGasDataTypes(),
    ...createPhysicsDataTypes(),
    createTcaRuleDataType(),
    ...createOutpostDataTypes()
  ];
}

export function registerOutpostDataTypes(registry: DataRegistry): void {
  for (const definition of createAllOutpostDataTypes()) {
    registry.registerType(definition);
  }
}
