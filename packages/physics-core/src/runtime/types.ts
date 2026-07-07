import type { DataRef } from "@gamekit/data";
import type { EntityId } from "@gamekit/world";

export type PhysicsSceneId = string;
export type PhysicsBodyId = string;
export type PhysicsColliderId = string;
export type PhysicsMaterialId = string;
export type PhysicsDimension = "2d" | "3d";

export type PhysicsVector = {
  x: number;
  y: number;
  z?: number;
};

export type PhysicsQuaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type PhysicsRotation = number | PhysicsVector | PhysicsQuaternion;
export type PhysicsBodyKind = "static" | "dynamic" | "kinematic";

export type PhysicsCollisionFilter = {
  groups?: string[];
  collidesWith?: string[];
  categoryBits?: number;
  maskBits?: number;
};

export type PhysicsBodyDefinition = {
  id?: PhysicsBodyId;
  kind: PhysicsBodyKind;
  position?: PhysicsVector;
  rotation?: PhysicsRotation;
  linearVelocity?: PhysicsVector;
  angularVelocity?: PhysicsRotation;
  gravityScale?: number;
  damping?: {
    linear?: number;
    angular?: number;
  };
  lockedAxes?: string[];
  userData?: Record<string, unknown>;
};

export type PhysicsBodyPatch = {
  position?: PhysicsVector;
  rotation?: PhysicsRotation;
  linearVelocity?: PhysicsVector;
  angularVelocity?: PhysicsRotation;
  gravityScale?: number;
  sleeping?: boolean;
  userData?: Record<string, unknown>;
};

export type PhysicsShapeDefinition =
  | { type: "circle"; radius: number }
  | { type: "box"; width: number; height: number; depth?: number }
  | { type: "capsule"; radius: number; height: number }
  | { type: "sphere"; radius: number }
  | { type: "polygon"; points: PhysicsVector[] }
  | { type: "polyline"; points: PhysicsVector[] }
  | { type: "mesh"; assetId: string; convex?: boolean }
  | { type: "custom"; backend: string; props: Record<string, unknown> };

export type PhysicsMaterialDefinition = {
  id: PhysicsMaterialId;
  friction?: number;
  restitution?: number;
  density?: number;
  combine?: {
    friction?: "min" | "max" | "multiply" | "average";
    restitution?: "min" | "max" | "multiply" | "average";
  };
};

export type PhysicsColliderDefinition = {
  id?: PhysicsColliderId;
  bodyId?: PhysicsBodyId;
  shape: PhysicsShapeDefinition;
  material?: PhysicsMaterialId;
  sensor?: boolean;
  filter?: PhysicsCollisionFilter;
  offset?: {
    position?: PhysicsVector;
    rotation?: PhysicsRotation;
  };
  userData?: Record<string, unknown>;
};

export type PhysicsColliderPatch = {
  enabled?: boolean;
  sensor?: boolean;
  filter?: PhysicsCollisionFilter;
  offset?: {
    position?: PhysicsVector;
    rotation?: PhysicsRotation;
  };
  userData?: Record<string, unknown>;
};

export type PhysicsSceneConfig = {
  id?: PhysicsSceneId;
  dimension?: PhysicsDimension;
  gravity?: PhysicsVector;
  fixedDeltaMs?: number;
};

export type PhysicsBackendCapabilities = {
  dimension: PhysicsDimension;
  bodies: boolean;
  colliders: boolean;
  sensors: boolean;
  queries: Array<PhysicsQuery["type"]>;
  deterministic?: boolean;
  custom?: Record<string, boolean | string | number>;
};

export type PhysicsBackendAdapter<TNative = unknown> = {
  id: string;
  kind: string;
  dimension: PhysicsDimension;
  createScene(config?: PhysicsSceneConfig): PhysicsScene<TNative>;
  capabilities(): PhysicsBackendCapabilities;
};

export type PhysicsBodyState = {
  id: PhysicsBodyId;
  kind: PhysicsBodyKind;
  position: PhysicsVector;
  linearVelocity: PhysicsVector;
  sleeping: boolean;
  rotation?: PhysicsRotation;
  angularVelocity?: PhysicsRotation;
  userData?: Record<string, unknown>;
};

export type PhysicsColliderState = {
  id: PhysicsColliderId;
  bodyId?: PhysicsBodyId;
  shape: PhysicsShapeDefinition;
  sensor: boolean;
  enabled: boolean;
  material?: PhysicsMaterialId;
  filter?: PhysicsCollisionFilter;
  offset?: {
    position?: PhysicsVector;
    rotation?: PhysicsRotation;
  };
  userData?: Record<string, unknown>;
};

export type PhysicsContactPhase = "enter" | "exit";
export type PhysicsContactKind = "contact" | "trigger";

export type PhysicsContactEvent = {
  phase: PhysicsContactPhase;
  kind: PhysicsContactKind;
  colliderA: PhysicsColliderId;
  colliderB: PhysicsColliderId;
  bodyA?: PhysicsBodyId;
  bodyB?: PhysicsBodyId;
  entityA?: EntityId;
  entityB?: EntityId;
  sensor: boolean;
};

export type PhysicsDiagnostic = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  bodyId?: PhysicsBodyId;
  colliderId?: PhysicsColliderId;
  details?: Record<string, unknown>;
};

export type PhysicsStepOptions = {
  tick?: number;
  elapsed?: number;
};

export type PhysicsStepResult = {
  deltaMs: number;
  contacts: PhysicsContactEvent[];
  diagnostics: PhysicsDiagnostic[];
};

export type PhysicsQuery =
  | PhysicsPointQuery
  | PhysicsRaycastQuery
  | PhysicsShapeCastQuery
  | PhysicsOverlapQuery
  | PhysicsCheckQuery
  | PhysicsBoundsQuery;

export type PhysicsQueryTriggerInteraction = "use-scene" | "include" | "exclude" | "only";
export type PhysicsQueryMode = "any" | "closest" | "all";
export type PhysicsQuerySort = "none" | "distance";

export type PhysicsQueryOptions = {
  filter?: PhysicsCollisionFilter;
  triggerInteraction?: PhysicsQueryTriggerInteraction;
  mode?: PhysicsQueryMode;
  sort?: PhysicsQuerySort;
  maxResults?: number;
  ignoreBodies?: PhysicsBodyId[];
  ignoreColliders?: PhysicsColliderId[];
  includeBodies?: PhysicsBodyId[];
  includeColliders?: PhysicsColliderId[];
};

export type PhysicsLegacyQueryOptions = {
  filter?: PhysicsCollisionFilter;
  includeSensors?: boolean;
  options?: PhysicsQueryOptions;
};

export type PhysicsPointQuery = PhysicsLegacyQueryOptions & {
  type: "point";
  point: PhysicsVector;
  solid?: boolean;
};

export type PhysicsRaycastQuery = PhysicsLegacyQueryOptions & {
  type: "raycast";
  origin: PhysicsVector;
  direction: PhysicsVector;
  maxDistance?: number;
  solid?: boolean;
};

export type PhysicsShapeCastQuery = PhysicsLegacyQueryOptions & {
  type: "shape-cast";
  shape: PhysicsShapeDefinition;
  position?: PhysicsVector;
  rotation?: PhysicsRotation;
  direction: PhysicsVector;
  maxDistance?: number;
  targetDistance?: number;
  stopAtPenetration?: boolean;
};

export type PhysicsOverlapQuery = PhysicsLegacyQueryOptions & {
  type: "overlap";
  shape: PhysicsShapeDefinition;
  position?: PhysicsVector;
  rotation?: PhysicsRotation;
};

export type PhysicsCheckQuery = PhysicsLegacyQueryOptions & {
  type: "check";
  shape: PhysicsShapeDefinition;
  position?: PhysicsVector;
  rotation?: PhysicsRotation;
};

export type PhysicsBounds = {
  min: PhysicsVector;
  max: PhysicsVector;
};

export type PhysicsBoundsQuery = PhysicsLegacyQueryOptions & {
  type: "bounds";
  bounds: PhysicsBounds;
};

export type PhysicsQueryResult = {
  colliderId: PhysicsColliderId;
  bodyId?: PhysicsBodyId;
  point?: PhysicsVector;
  normal?: PhysicsVector;
  distance?: number;
  fraction?: number;
  inside?: boolean;
  sensor?: boolean;
  entityId?: EntityId;
};

export type PhysicsSceneSnapshot = {
  id: PhysicsSceneId;
  backend: string;
  dimension: PhysicsDimension;
  gravity: PhysicsVector;
  bodyCount: number;
  colliderCount: number;
  activeContactCount: number;
  disposed: boolean;
};

export type PhysicsScene<TNative = unknown> = {
  readonly id: PhysicsSceneId;
  createBody(definition: PhysicsBodyDefinition): PhysicsBodyId;
  updateBody(id: PhysicsBodyId, patch: PhysicsBodyPatch): void;
  destroyBody(id: PhysicsBodyId): void;
  createCollider(definition: PhysicsColliderDefinition): PhysicsColliderId;
  updateCollider(id: PhysicsColliderId, patch: PhysicsColliderPatch): void;
  destroyCollider(id: PhysicsColliderId): void;
  step(deltaMs: number, options?: PhysicsStepOptions): PhysicsStepResult;
  getBodyState(id: PhysicsBodyId): PhysicsBodyState | undefined;
  getColliderState(id: PhysicsColliderId): PhysicsColliderState | undefined;
  query(query: PhysicsQuery): PhysicsQueryResult[];
  snapshot(): PhysicsSceneSnapshot;
  native?(): TNative;
  dispose(): void;
};

export type PhysicsBodyData = PhysicsBodyDefinition & {
  colliders?: Array<DataRef<"physics.collider">>;
  tags?: string[];
};

export type PhysicsColliderData = PhysicsColliderDefinition & {
  tags?: string[];
};

export type PhysicsSceneData = PhysicsSceneConfig & {
  materials?: Array<DataRef<"physics.material">>;
};

export type PhysicsTraceKind = "step" | "contact" | "query" | "diagnostic";

export type PhysicsTraceEntry = {
  id: string;
  kind: PhysicsTraceKind;
  tick?: number;
  elapsed?: number;
  label: string;
  bodyId?: PhysicsBodyId;
  colliderId?: PhysicsColliderId;
  entityId?: EntityId;
  payload?: Record<string, unknown>;
};

export type PhysicsTraceStore = {
  push(entry: Omit<PhysicsTraceEntry, "id">): PhysicsTraceEntry;
  list(): PhysicsTraceEntry[];
  clear(): void;
};
