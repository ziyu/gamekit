import type {
  DataDiagnostic,
  DataDocument,
  DataReferenceTarget,
  DataTypeDefinition
} from "@gamekit/data";
import type {
  PhysicsBodyData,
  PhysicsColliderData,
  PhysicsMaterialDefinition,
  PhysicsSceneData,
  PhysicsShapeDefinition
} from "../runtime/types";

export type PhysicsDataTypeDefinition =
  | DataTypeDefinition<PhysicsMaterialDefinition>
  | DataTypeDefinition<PhysicsBodyData>
  | DataTypeDefinition<PhysicsColliderData>
  | DataTypeDefinition<PhysicsSceneData>;

export function createPhysicsMaterialDataType(): DataTypeDefinition<PhysicsMaterialDefinition> {
  return {
    type: "physics.material",
    validate(document: DataDocument<PhysicsMaterialDefinition>) {
      const diagnostics: DataDiagnostic[] = [];
      if (!document.data.id) {
        diagnostics.push(diagnostic("physics.material_missing_id", document, "data.id"));
      }
      if (document.data.density !== undefined && document.data.density < 0) {
        diagnostics.push(diagnostic("physics.material_invalid_density", document, "data.density"));
      }

      return diagnostics;
    }
  };
}

export function createPhysicsBodyDataType(): DataTypeDefinition<PhysicsBodyData> {
  return {
    type: "physics.body",
    validate(document: DataDocument<PhysicsBodyData>) {
      const diagnostics: DataDiagnostic[] = [];
      if (!["static", "dynamic", "kinematic"].includes(document.data.kind)) {
        diagnostics.push(diagnostic("physics.body_invalid_kind", document, "data.kind"));
      }

      return diagnostics;
    },
    references(document: DataDocument<PhysicsBodyData>) {
      return (document.data.colliders ?? []).map((reference, index: number) => ({
        type: reference.type,
        id: reference.id,
        path: `data.colliders[${index}]`
      }));
    }
  };
}

export function createPhysicsColliderDataType(): DataTypeDefinition<PhysicsColliderData> {
  return {
    type: "physics.collider",
    validate(document: DataDocument<PhysicsColliderData>) {
      const diagnostics: DataDiagnostic[] = [];
      diagnostics.push(...validateShape(document.data.shape, document));
      return diagnostics;
    },
    references(document: DataDocument<PhysicsColliderData>) {
      const references: DataReferenceTarget[] = [];
      if (document.data.material) {
        references.push({
          type: "physics.material",
          id: document.data.material,
          path: "data.material"
        });
      }

      return references;
    }
  };
}

export function createPhysicsSceneDataType(): DataTypeDefinition<PhysicsSceneData> {
  return {
    type: "physics.scene",
    references(document: DataDocument<PhysicsSceneData>) {
      return (document.data.materials ?? []).map((reference, index: number) => ({
        type: reference.type,
        id: reference.id,
        path: `data.materials[${index}]`
      }));
    }
  };
}

export function createPhysicsDataTypes(): PhysicsDataTypeDefinition[] {
  return [
    createPhysicsMaterialDataType(),
    createPhysicsBodyDataType(),
    createPhysicsColliderDataType(),
    createPhysicsSceneDataType()
  ];
}

function validateShape(
  shape: PhysicsShapeDefinition | undefined,
  document: DataDocument<PhysicsColliderData>
): DataDiagnostic[] {
  if (!shape) {
    return [diagnostic("physics.collider_missing_shape", document, "data.shape")];
  }

  switch (shape.type) {
    case "circle":
    case "sphere":
      return shape.radius > 0
        ? []
        : [diagnostic("physics.shape_invalid_radius", document, "data.shape.radius")];
    case "box":
      return shape.width > 0 && shape.height > 0
        ? []
        : [diagnostic("physics.shape_invalid_box", document, "data.shape")];
    case "capsule":
      return shape.radius > 0 && shape.height > 0
        ? []
        : [diagnostic("physics.shape_invalid_capsule", document, "data.shape")];
    case "polygon":
    case "polyline":
      return shape.points.length >= 2
        ? []
        : [diagnostic("physics.shape_invalid_points", document, "data.shape.points")];
    case "mesh":
      return shape.assetId
        ? []
        : [diagnostic("physics.shape_missing_mesh_asset", document, "data.shape.assetId")];
    case "custom":
      return shape.backend
        ? []
        : [diagnostic("physics.shape_missing_backend", document, "data.shape.backend")];
  }
}

function diagnostic(code: string, document: DataDocument<unknown>, path: string): DataDiagnostic {
  return {
    code,
    message: code,
    severity: "error",
    key: { type: document.type, id: document.id },
    path,
    ...(document.sourcePackId === undefined ? {} : { sourcePackId: document.sourcePackId })
  };
}
