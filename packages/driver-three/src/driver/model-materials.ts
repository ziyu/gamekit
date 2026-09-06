import type { ThreeMaterialTarget, ThreeObjectTarget } from "./structural-types";

type CloneableMaterialTarget = ThreeMaterialTarget & {
  clone?: () => ThreeMaterialTarget;
};

export function cloneObjectMaterialInstances(root: ThreeObjectTarget): void {
  const clones = new Map<CloneableMaterialTarget, ThreeMaterialTarget>();

  visitObject(root, (object) => {
    const material = object.material;
    if (Array.isArray(material)) {
      object.material = material.map((entry) => cloneMaterial(entry, clones));
      markInstanceMaterialOwner(object);
      return;
    }
    if (isMaterialTarget(material)) {
      object.material = cloneMaterial(material, clones);
      markInstanceMaterialOwner(object);
    }
  });
}

function visitObject(object: ThreeObjectTarget, visit: (object: ThreeObjectTarget) => void): void {
  visit(object);
  for (const child of object.children ?? []) {
    visitObject(child, visit);
  }
}

function cloneMaterial(
  material: CloneableMaterialTarget,
  clones: Map<CloneableMaterialTarget, ThreeMaterialTarget>
): ThreeMaterialTarget {
  const existing = clones.get(material);
  if (existing) {
    return existing;
  }

  const clone = material.clone?.() ?? { ...material };
  clones.set(material, clone);
  return clone;
}

function markInstanceMaterialOwner(object: ThreeObjectTarget): void {
  object.userData ??= {};
  object.userData.assetInstanceMaterial = true;
}

function isMaterialTarget(value: unknown): value is CloneableMaterialTarget {
  return value !== null && typeof value === "object";
}
