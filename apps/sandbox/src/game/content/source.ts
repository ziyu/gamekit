import type { DataTypeDefinition } from "@gamekit/data";
import type {
  RenderNodeDefinition,
  RenderObjectDefinition,
  RenderObjectType
} from "@gamekit/renderer-core";
import type { SandboxRenderNodeAnimation, SandboxSceneRole } from "../components";

export const SANDBOX_ASSET_GROUP = "sandbox.preload";
export const SANDBOX_ACTOR_ID = "actor.sandbox.scout_swarm";
export const SANDBOX_GAS_ACTOR_DEFINITION_ID = "gas.actor.sandbox.scout";
export const SANDBOX_ENTITY_RENDER_OBJECT_ID = "render.sandbox.entity";
export const SANDBOX_ENTITY_RENDER_RIG_ID = "renderRig.sandbox.scout_swarm";
export const SANDBOX_SIGNAL_OUTPOST_LAYOUT_ID = "sceneLayout.sandbox.signal_outpost";

const SANDBOX_ENTITY_TEXTURE_ID = "asset.sandbox.entity_square";
const SANDBOX_RING_TEXTURE_ID = "asset.sandbox.signal_ring";

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
  stationDefinitionId?: string | undefined;
  productionRecipeId?: string | undefined;
  capacity?: number | undefined;
  productionRate?: number | undefined;
  tags?: string[];
};

export type SandboxStationDefinition = {
  id: string;
  label: string;
  zone: "core" | "signal-field" | "fabrication-bay" | "archive-wing" | "rift";
  priority: number;
  initialStability: number;
  baseHeat: number;
  throughput: number;
  supportedTasks: Array<"collect" | "deliver" | "repair" | "suppress" | "scan">;
  tags?: string[];
};

export type SandboxProductionRecipeDefinition = {
  id: string;
  label: string;
  input: Array<{ resource: "signal" | "fragment"; amount: number }>;
  output: { resource: "signal" | "fragment" | "objective" | "unlock"; amount: number };
  durationMs: number;
  stationRole: SandboxSceneRole;
  tags?: string[];
};

export type SandboxObjectivePhaseDefinition = {
  id: string;
  label: string;
  targetSignal: number;
  unlocks: string[];
  reward: string;
  tags?: string[];
};

export type SandboxThreatProfileDefinition = {
  id: string;
  label: string;
  cadenceTicks: number;
  effectId: string;
  targetRoles: SandboxSceneRole[];
  tags?: string[];
};

export type SandboxOutpostRouteDefinition = {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  capacity: number;
  visual: "signal" | "resource" | "threat";
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
  scoutCount: number;
  tags?: string[];
};

export function createRenderObjectDataType(
  supportedTypes: RenderObjectType[]
): DataTypeDefinition<RenderObjectDefinition> {
  const supported = new Set(supportedTypes);

  return {
    type: "render.object",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return collectRenderObjectAssetReferences(document.data);
    },
    validate(document) {
      return collectUnsupportedRenderTypes(document.data, supported).map((entry) => ({
        code: "sandbox.unknown_render_type",
        message: `Unsupported sandbox render object type: ${entry.type}`,
        severity: "error" as const,
        key: document,
        path: entry.path
      }));
    }
  };
}

export function createRenderRigDataType(): DataTypeDefinition<SandboxRenderRigDefinition> {
  return {
    type: "sandbox.renderRig",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [{ type: "render.object", id: document.data.renderObjectId, path: "renderObjectId" }];
    },
    validate(document) {
      return document.data.nodeAnimations.length === 0
        ? [
            {
              code: "sandbox.render_rig_missing_animation",
              message: "Sandbox render rig should contain at least one node animation",
              severity: "warning" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createActorDataType(): DataTypeDefinition<SandboxActorDefinition> {
  return {
    type: "sandbox.actor",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        { type: "sandbox.renderRig", id: document.data.renderRigId, path: "renderRigId" },
        ...document.data.abilityIds.map((id, index) => ({
          type: "sandbox.ability",
          id,
          path: `abilityIds[${index}]`
        }))
      ];
    },
    validate(document) {
      const diagnostics = [];

      if (document.data.entityCount < 1) {
        diagnostics.push({
          code: "sandbox.actor_invalid_entity_count",
          message: "Sandbox actor entityCount must be at least 1",
          severity: "error" as const,
          key: document
        });
      }

      if (document.data.baseSpeed <= 0) {
        diagnostics.push({
          code: "sandbox.actor_invalid_base_speed",
          message: "Sandbox actor baseSpeed must be positive",
          severity: "error" as const,
          key: document
        });
      }

      return diagnostics;
    }
  };
}

export function createAbilityDataType(): DataTypeDefinition<SandboxAbilityDefinition> {
  return {
    type: "sandbox.ability",
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      return document.data.cooldownMs < 0
        ? [
            {
              code: "sandbox.ability_invalid_cooldown",
              message: "Sandbox ability cooldownMs cannot be negative",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createSceneObjectDataType(): DataTypeDefinition<SandboxSceneObjectDefinition> {
  return {
    type: "sandbox.sceneObject",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      const references = [
        { type: "render.object", id: document.data.renderObjectId, path: "renderObjectId" }
      ];
      if (document.data.renderRigId) {
        references.push({
          type: "sandbox.renderRig",
          id: document.data.renderRigId,
          path: "renderRigId"
        });
      }
      if (document.data.gasActorDefinitionId) {
        references.push({
          type: "gas.actor",
          id: document.data.gasActorDefinitionId,
          path: "gasActorDefinitionId"
        });
      }
      if (document.data.stationDefinitionId) {
        references.push({
          type: "sandbox.station",
          id: document.data.stationDefinitionId,
          path: "stationDefinitionId"
        });
      }
      if (document.data.productionRecipeId) {
        references.push({
          type: "sandbox.productionRecipe",
          id: document.data.productionRecipeId,
          path: "productionRecipeId"
        });
      }
      return references;
    },
    validate(document) {
      const diagnostics = [];
      if (
        document.data.x < 0 ||
        document.data.x > 100 ||
        document.data.y < 0 ||
        document.data.y > 100
      ) {
        diagnostics.push({
          code: "sandbox.scene_object_invalid_position",
          message: "Sandbox scene object position must be expressed as 0-100 percent",
          severity: "error" as const,
          key: document
        });
      }
      return diagnostics;
    }
  };
}

export function createStationDataType(): DataTypeDefinition<SandboxStationDefinition> {
  return {
    type: "sandbox.station",
    getTags: (definition) => definition.tags ?? [],
    indexes: [
      {
        id: "zone",
        values(document) {
          return [document.data.zone];
        }
      }
    ],
    validate(document) {
      const diagnostics = [];
      if (document.data.priority < 1) {
        diagnostics.push({
          code: "sandbox.station_invalid_priority",
          message: "Sandbox station priority must be at least 1",
          severity: "error" as const,
          key: document
        });
      }
      if (document.data.supportedTasks.length === 0) {
        diagnostics.push({
          code: "sandbox.station_missing_tasks",
          message: "Sandbox station must support at least one work task",
          severity: "error" as const,
          key: document
        });
      }
      return diagnostics;
    }
  };
}

export function createProductionRecipeDataType(): DataTypeDefinition<SandboxProductionRecipeDefinition> {
  return {
    type: "sandbox.productionRecipe",
    getTags: (definition) => definition.tags ?? [],
    indexes: [
      {
        id: "stationRole",
        values(document) {
          return [document.data.stationRole];
        }
      }
    ],
    validate(document) {
      return document.data.durationMs <= 0
        ? [
            {
              code: "sandbox.recipe_invalid_duration",
              message: "Sandbox production recipe duration must be positive",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createObjectivePhaseDataType(): DataTypeDefinition<SandboxObjectivePhaseDefinition> {
  return {
    type: "sandbox.objectivePhase",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return document.data.unlocks
        .filter((id) => id.startsWith("recipe."))
        .map((id, index) => ({ type: "sandbox.productionRecipe", id, path: `unlocks[${index}]` }));
    },
    validate(document) {
      return document.data.targetSignal <= 0
        ? [
            {
              code: "sandbox.objective_invalid_target",
              message: "Sandbox objective phase targetSignal must be positive",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createThreatProfileDataType(): DataTypeDefinition<SandboxThreatProfileDefinition> {
  return {
    type: "sandbox.threatProfile",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [{ type: "gas.effect", id: document.data.effectId, path: "effectId" }];
    },
    validate(document) {
      return document.data.cadenceTicks < 1
        ? [
            {
              code: "sandbox.threat_invalid_cadence",
              message: "Sandbox threat cadenceTicks must be at least 1",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createOutpostRouteDataType(): DataTypeDefinition<SandboxOutpostRouteDefinition> {
  return {
    type: "sandbox.outpostRoute",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        { type: "sandbox.sceneObject", id: document.data.fromObjectId, path: "fromObjectId" },
        { type: "sandbox.sceneObject", id: document.data.toObjectId, path: "toObjectId" }
      ];
    },
    validate(document) {
      return document.data.capacity <= 0
        ? [
            {
              code: "sandbox.route_invalid_capacity",
              message: "Sandbox route capacity must be positive",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createSceneLayoutDataType(): DataTypeDefinition<SandboxSceneLayoutDefinition> {
  return {
    type: "sandbox.sceneLayout",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        ...document.data.objectIds.map((id, index) => ({
          type: "sandbox.sceneObject",
          id,
          path: `objectIds[${index}]`
        })),
        ...document.data.links.flatMap((link, index) => [
          {
            type: "sandbox.sceneObject",
            id: link.fromObjectId,
            path: `links[${index}].fromObjectId`
          },
          {
            type: "sandbox.sceneObject",
            id: link.toObjectId,
            path: `links[${index}].toObjectId`
          }
        ]),
        ...document.data.links
          .filter((link) => link.routeId)
          .map((link, index) => ({
            type: "sandbox.outpostRoute",
            id: link.routeId!,
            path: `links[${index}].routeId`
          }))
      ];
    },
    validate(document) {
      return document.data.scoutCount < 1
        ? [
            {
              code: "sandbox.scene_layout_missing_scout",
              message: "Sandbox scene layout must include at least one scout",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createBiomeDataType(): DataTypeDefinition<SandboxBiomeDefinition> {
  return {
    type: "sandbox.biome",
    getTags: (definition) => definition.tags ?? [],
    indexes: [
      {
        id: "hazard",
        values(document) {
          return document.data.navigation.hazards.map((hazard) => hazard.id);
        }
      }
    ],
    validate(document) {
      return document.data.navigation.friction < 0
        ? [
            {
              code: "sandbox.biome_invalid_friction",
              message: "Sandbox biome friction cannot be negative",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

export function createSpawnProfileDataType(): DataTypeDefinition<SandboxSpawnProfileDefinition> {
  return {
    type: "sandbox.spawnProfile",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        { type: "sandbox.actor", id: document.data.actorId, path: "actorId" },
        { type: "sandbox.biome", id: document.data.biomeId, path: "biomeId" }
      ];
    },
    validate(document) {
      return document.data.waves.some((wave) => wave.count < 1)
        ? [
            {
              code: "sandbox.spawn_profile_invalid_wave",
              message: "Sandbox spawn profile waves must spawn at least one actor",
              severity: "error" as const,
              key: document
            }
          ]
        : [];
    }
  };
}

function collectRenderObjectAssetReferences(
  definition: RenderObjectDefinition
): Array<{ type: string; id: string; path: string }> {
  const references = collectNodeAssetReferences(definition, "props.textureId");
  for (const child of definition.children ?? []) {
    references.push(...collectNodeAssetReferences(child, `children.${child.id ?? child.type}`));
  }

  return references;
}

function collectNodeAssetReferences(
  definition: RenderObjectDefinition | RenderNodeDefinition,
  path: string
): Array<{ type: string; id: string; path: string }> {
  const textureId =
    typeof definition.props?.textureId === "string" ? definition.props.textureId : undefined;
  const references = textureId ? [{ type: "asset.definition", id: textureId, path }] : [];

  for (const child of definition.children ?? []) {
    const childPath = `${path}.children.${child.id ?? child.type}`;
    references.push(...collectNodeAssetReferences(child, childPath));
  }

  return references;
}

function collectUnsupportedRenderTypes(
  definition: RenderObjectDefinition | RenderNodeDefinition,
  supported: Set<RenderObjectType>,
  path = "type"
): Array<{ type: string; path: string }> {
  const unsupported = supported.has(definition.type) ? [] : [{ type: definition.type, path }];

  for (const child of definition.children ?? []) {
    unsupported.push(
      ...collectUnsupportedRenderTypes(
        child,
        supported,
        `${path}.children.${child.id ?? child.type}`
      )
    );
  }

  return unsupported;
}

export function createOutpostRenderRig(
  id: string,
  renderObjectId: string,
  nodeAnimations: SandboxRenderNodeAnimation[]
): SandboxRenderRigDefinition {
  return {
    id,
    renderObjectId,
    nodeAnimations,
    tags: ["sandbox", "signal-outpost", "animated"]
  };
}

export function createStationDefinition(
  id: string,
  label: string,
  zone: SandboxStationDefinition["zone"],
  priority: number,
  supportedTasks: SandboxStationDefinition["supportedTasks"]
): SandboxStationDefinition {
  return {
    id,
    label,
    zone,
    priority,
    initialStability: zone === "rift" ? 100 : 92,
    baseHeat: zone === "signal-field" ? 18 : 8,
    throughput: zone === "signal-field" ? 1.1 : zone === "core" ? 1.25 : 0.85,
    supportedTasks,
    tags: ["sandbox", "station", zone]
  };
}

export function createRouteDefinition(
  id: string,
  fromObjectId: string,
  toObjectId: string,
  capacity: number
): SandboxOutpostRouteDefinition {
  return {
    id,
    fromObjectId,
    toObjectId,
    capacity,
    visual: fromObjectId.includes("interference") ? "threat" : "signal",
    tags: ["sandbox", "route"]
  };
}

export function createOutpostRenderObject(
  id: string,
  role: Exclude<SandboxSceneRole, "signal-link">
): RenderObjectDefinition {
  const style = outpostRoleStyle(role);
  return {
    id,
    type: "container",
    children: [
      {
        id: "shadow",
        type: "sprite",
        transform: { position: { x: 5, y: 8 }, scale: { x: 1, y: 0.32 } },
        alpha: 0.22,
        props: {
          textureId: SANDBOX_ENTITY_TEXTURE_ID,
          width: style.size + 12,
          height: style.size,
          tint: 0x000000,
          depth: -2
        }
      },
      {
        id: "aura",
        type: "sprite",
        alpha: style.auraAlpha,
        props: {
          textureId: SANDBOX_RING_TEXTURE_ID,
          width: style.size + 24,
          height: style.size + 24,
          tint: style.aura,
          depth: -1
        }
      },
      {
        id: "outer",
        type: "sprite",
        props: {
          textureId: SANDBOX_RING_TEXTURE_ID,
          width: style.size + 10,
          height: style.size + 10,
          tint: style.outer,
          depth: 0
        }
      },
      {
        id: "inner",
        type: "sprite",
        props: {
          textureId: SANDBOX_RING_TEXTURE_ID,
          width: Math.max(16, style.size - 6),
          height: Math.max(16, style.size - 6),
          tint: style.inner,
          depth: 1
        }
      },
      {
        id: "body",
        type: "sprite",
        props: {
          textureId: SANDBOX_ENTITY_TEXTURE_ID,
          width: style.bodyWidth,
          height: style.bodyHeight,
          tint: style.body,
          depth: 2
        }
      },
      {
        id: "core",
        type: "sprite",
        props: {
          textureId: SANDBOX_ENTITY_TEXTURE_ID,
          width: style.core,
          height: style.core,
          tint: style.coreTint,
          depth: 3
        }
      },
      {
        id: "charge",
        type: "container",
        transform: { position: { x: 0, y: style.size / 2 + 12 } },
        children: [
          {
            id: "track",
            type: "sprite",
            alpha: 0.3,
            props: {
              textureId: SANDBOX_ENTITY_TEXTURE_ID,
              width: style.size + 12,
              height: 4,
              tint: 0xf3f0e8,
              depth: 4
            }
          },
          {
            id: "fill",
            type: "sprite",
            props: {
              textureId: SANDBOX_ENTITY_TEXTURE_ID,
              width: 2,
              height: 4,
              tint: style.fill,
              depth: 5
            }
          },
          {
            id: "ring",
            type: "sprite",
            alpha: 0.7,
            props: {
              textureId: SANDBOX_RING_TEXTURE_ID,
              width: 11,
              height: 11,
              tint: style.fill,
              depth: 6
            }
          }
        ]
      },
      {
        id: "beacon",
        type: "sprite",
        transform: { position: { x: 0, y: -style.size / 2 - 9 } },
        alpha: 0.78,
        props: {
          textureId: SANDBOX_ENTITY_TEXTURE_ID,
          width: style.beaconWidth,
          height: style.beaconHeight,
          tint: style.fill,
          depth: 7
        }
      },
      {
        id: "cargo",
        type: "sprite",
        transform: { position: { x: style.size / 2 + 8, y: -style.size / 3 } },
        alpha: role === "scout" ? 0.5 : 0,
        props: {
          textureId: SANDBOX_RING_TEXTURE_ID,
          width: 16,
          height: 16,
          tint: 0xd9b35f,
          depth: 8
        }
      },
      {
        id: "task",
        type: "sprite",
        transform: { position: { x: -style.size / 2 - 8, y: style.size / 3 } },
        alpha: role === "scout" ? 0.74 : 0,
        props: {
          textureId: SANDBOX_ENTITY_TEXTURE_ID,
          width: 8,
          height: 8,
          tint: 0x64c2d0,
          depth: 9
        }
      },
      {
        id: "field",
        type: "sprite",
        alpha: role === "interference-node" ? 0.32 : 0,
        props: {
          textureId: SANDBOX_RING_TEXTURE_ID,
          width: style.size + 46,
          height: style.size + 46,
          tint: 0xdd3627,
          depth: -3
        }
      },
      {
        id: "gear",
        type: "sprite",
        alpha: role === "asset-fabricator" ? 0.8 : 0,
        props: {
          textureId: SANDBOX_RING_TEXTURE_ID,
          width: style.size + 4,
          height: style.size + 4,
          tint: 0xd9b35f,
          depth: 4
        }
      }
    ],
    tags: ["sandbox", "signal-outpost", role]
  };
}

export function createSignalLinkRenderObject(): RenderObjectDefinition {
  return {
    id: "render.sandbox.signal_link",
    type: "sprite",
    alpha: 0.65,
    props: {
      textureId: SANDBOX_ENTITY_TEXTURE_ID,
      width: 80,
      height: 4,
      tint: 0x64c2d0,
      depth: -10
    },
    tags: ["sandbox", "signal-outpost", "link"]
  };
}

function outpostRoleStyle(role: Exclude<SandboxSceneRole, "signal-link">) {
  switch (role) {
    case "command-core":
      return {
        size: 58,
        bodyWidth: 34,
        bodyHeight: 34,
        core: 14,
        aura: 0x64c2d0,
        auraAlpha: 0.28,
        outer: 0xf3f0e8,
        inner: 0xd9b35f,
        body: 0x273a35,
        coreTint: 0xf0bd4f,
        fill: 0xd9b35f,
        beaconWidth: 20,
        beaconHeight: 8
      };
    case "relay-tower":
      return {
        size: 44,
        bodyWidth: 18,
        bodyHeight: 38,
        core: 10,
        aura: 0x64c2d0,
        auraAlpha: 0.22,
        outer: 0x64c2d0,
        inner: 0x7fd16b,
        body: 0x2a4b48,
        coreTint: 0xf3f0e8,
        fill: 0x7fd16b,
        beaconWidth: 16,
        beaconHeight: 12
      };
    case "scout":
      return {
        size: 30,
        bodyWidth: 24,
        bodyHeight: 18,
        core: 7,
        aura: 0x7fd16b,
        auraAlpha: 0.2,
        outer: 0x7fd16b,
        inner: 0xf3f0e8,
        body: 0x7fd16b,
        coreTint: 0x10100e,
        fill: 0xd9b35f,
        beaconWidth: 10,
        beaconHeight: 5
      };
    case "data-node":
      return {
        size: 38,
        bodyWidth: 28,
        bodyHeight: 22,
        core: 8,
        aura: 0x9d89d8,
        auraAlpha: 0.18,
        outer: 0x9d89d8,
        inner: 0x64c2d0,
        body: 0x332d4a,
        coreTint: 0xf3f0e8,
        fill: 0x9d89d8,
        beaconWidth: 12,
        beaconHeight: 8
      };
    case "asset-fabricator":
      return {
        size: 40,
        bodyWidth: 30,
        bodyHeight: 24,
        core: 8,
        aura: 0xd9b35f,
        auraAlpha: 0.18,
        outer: 0xd9b35f,
        inner: 0xf3f0e8,
        body: 0x4a3f27,
        coreTint: 0xf3f0e8,
        fill: 0xd9b35f,
        beaconWidth: 14,
        beaconHeight: 8
      };
    case "interference-node":
      return {
        size: 46,
        bodyWidth: 30,
        bodyHeight: 30,
        core: 11,
        aura: 0xdd3627,
        auraAlpha: 0.26,
        outer: 0xdd3627,
        inner: 0xd9b35f,
        body: 0x4e201d,
        coreTint: 0xf3f0e8,
        fill: 0xdd3627,
        beaconWidth: 18,
        beaconHeight: 8
      };
  }
}
