import type { SandboxRenderNodeAnimation, SandboxSceneRole } from "../components";

export type SandboxAbilityDefinition = {
  id: string;
  name: string;
  cooldownMs: number;
  trigger: Record<string, unknown>;
  costs: Array<{ resource: string; amount: number }>;
  effects: Array<{ type: string; params?: Record<string, unknown> }>;
  tags?: string[];
};

export type SandboxActorDefinition = {
  id: string;
  name: string;
  entityCount: number;
  baseSpeed: number;
  renderRigId: string;
  abilityIds: string[];
  tags?: string[];
};

export type SandboxBiomeDefinition = {
  id: string;
  name: string;
  navigation: {
    friction: number;
    preferredAltitude: number;
    hazards: Array<{
      id: string;
      severity: number;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  };
  lighting: {
    ambient: number;
    accents: number[];
  };
  tags?: string[];
};

export type SandboxRenderRigDefinition = {
  id: string;
  renderObjectId: string;
  nodeAnimations: SandboxRenderNodeAnimation[];
  tags?: string[];
};

export type SandboxSpawnProfileDefinition = {
  id: string;
  actorId: string;
  biomeId: string;
  formation: {
    type: "arc" | "line" | "cluster";
    radius: number;
    jitter: number;
  };
  waves: Array<{ delayMs: number; count: number }>;
  tags?: string[];
};

export type SandboxSceneObjectDefinition = {
  id: string;
  label: string;
  role: SandboxSceneRole;
  x: number;
  y: number;
  renderObjectId: string;
  renderRigId?: string | undefined;
  gasActorDefinitionId?: string | undefined;
  buildingDefinitionId?: string | undefined;
  recipeId?: string | undefined;
  capacity?: number | undefined;
  productionRate?: number | undefined;
  tags?: string[];
};

export type SandboxBuildingDefinition = {
  id: string;
  label: string;
  zone: "camp" | "forest" | "quarry" | "food" | "workshop" | "defense" | "wilds";
  priority: number;
  initialHealth: number;
  baseHeat: number;
  throughput: number;
  supportedTasks: Array<"gather" | "haul" | "build" | "repair" | "defend" | "rescue">;
  tags?: string[];
};

export type SandboxRecipeDefinition = {
  id: string;
  label: string;
  input: Array<{ resource: "resource" | "materials"; amount: number }>;
  output: { resource: "resource" | "materials" | "objective" | "unlock"; amount: number };
  durationMs: number;
  buildingRole: SandboxSceneRole;
  tags?: string[];
};

export type SandboxObjectivePhaseDefinition = {
  id: string;
  label: string;
  targetResources: number;
  unlocks: string[];
  reward: string;
  tags?: string[];
};

export type SandboxWaveDefinition = {
  id: string;
  label: string;
  cadenceTicks: number;
  effectId: string;
  targetRoles: SandboxSceneRole[];
  tags?: string[];
};

export type SandboxRouteDefinition = {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  capacity: number;
  visual: "resource" | "task" | "threat";
  tags?: string[];
};

export type SandboxSceneLayoutDefinition = {
  id: string;
  name: string;
  objectIds: string[];
  links: Array<{
    id: string;
    fromObjectId: string;
    toObjectId: string;
    routeId?: string | undefined;
    corrupted?: boolean | undefined;
  }>;
  workerCount: number;
  tags?: string[];
};
