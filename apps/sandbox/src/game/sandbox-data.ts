import { createAssetDataKind, type AssetDefinition } from "@gamekit/asset";
import {
  createDataRegistry,
  type DataKindDefinition,
  type DataPack,
  type DataRegistry
} from "@gamekit/data";
import type {
  RenderNodeDefinition,
  RenderObjectDefinition,
  RenderObjectType
} from "@gamekit/renderer-core";
import type { SandboxRenderNodeAnimation } from "./components";

export const SANDBOX_ASSET_GROUP = "sandbox.preload";
export const SANDBOX_ACTOR_ID = "actor.sandbox.scout_swarm";
export const SANDBOX_ENTITY_RENDER_OBJECT_ID = "render.sandbox.entity";
export const SANDBOX_ENTITY_RENDER_RIG_ID = "renderRig.sandbox.scout_swarm";

const SANDBOX_ENTITY_TEXTURE_ID = "asset.sandbox.entity_square";
const SANDBOX_RING_TEXTURE_ID = "asset.sandbox.signal_ring";
const TINTABLE_ENTITY_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='2' width='28' height='28' rx='4' fill='white'/%3E%3C/svg%3E";
const TINTABLE_RING_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='24' fill='none' stroke='white' stroke-width='7'/%3E%3C/svg%3E";

export const sandboxDataPack: DataPack = {
  id: "sandbox.base",
  version: "1.0.0",
  namespace: "sandbox",
  data: {
    asset: [
      {
        id: SANDBOX_ENTITY_TEXTURE_ID,
        type: "image",
        source: {
          type: "url",
          url: TINTABLE_ENTITY_SVG
        },
        group: SANDBOX_ASSET_GROUP,
        tags: ["preload", "sandbox", "tintable"]
      } satisfies AssetDefinition,
      {
        id: SANDBOX_RING_TEXTURE_ID,
        type: "image",
        source: {
          type: "url",
          url: TINTABLE_RING_SVG
        },
        group: SANDBOX_ASSET_GROUP,
        tags: ["preload", "sandbox", "tintable", "ring"]
      } satisfies AssetDefinition
    ],
    renderObject: [
      {
        id: SANDBOX_ENTITY_RENDER_OBJECT_ID,
        type: "container",
        children: [
          {
            id: "shadow",
            type: "sprite",
            transform: { position: { x: 5, y: 8 }, scale: { x: 1, y: 0.36 } },
            alpha: 0.2,
            props: {
              textureId: SANDBOX_ENTITY_TEXTURE_ID,
              width: 30,
              height: 30,
              tint: 0x000000,
              depth: -1
            }
          },
          {
            id: "aura",
            type: "sprite",
            alpha: 0.38,
            props: {
              textureId: SANDBOX_RING_TEXTURE_ID,
              width: 54,
              height: 54,
              tint: 0x64c2d0,
              depth: 0
            }
          },
          {
            id: "body",
            type: "sprite",
            props: {
              textureId: SANDBOX_ENTITY_TEXTURE_ID,
              width: 24,
              height: 24,
              tint: 0x7fd16b,
              depth: 2
            }
          },
          {
            id: "core",
            type: "sprite",
            props: {
              textureId: SANDBOX_ENTITY_TEXTURE_ID,
              width: 9,
              height: 9,
              tint: 0xf3f0e8,
              depth: 3
            }
          },
          {
            id: "marker",
            type: "container",
            transform: { position: { x: 0, y: -26 } },
            children: [
              {
                id: "ring",
                type: "sprite",
                alpha: 0.72,
                props: {
                  textureId: SANDBOX_RING_TEXTURE_ID,
                  width: 18,
                  height: 18,
                  tint: 0xf0bd4f,
                  depth: 4
                }
              },
              {
                id: "pip",
                type: "sprite",
                props: {
                  textureId: SANDBOX_ENTITY_TEXTURE_ID,
                  width: 5,
                  height: 5,
                  tint: 0xf0bd4f,
                  depth: 5
                }
              }
            ]
          },
          {
            id: "thruster",
            type: "container",
            transform: { position: { x: -17, y: 11 } },
            children: [
              {
                id: "left",
                type: "sprite",
                transform: { position: { x: 0, y: -4 } },
                alpha: 0.55,
                props: {
                  textureId: SANDBOX_ENTITY_TEXTURE_ID,
                  width: 8,
                  height: 4,
                  tint: 0xdd3627,
                  depth: 1
                }
              },
              {
                id: "right",
                type: "sprite",
                transform: { position: { x: 0, y: 4 } },
                alpha: 0.55,
                props: {
                  textureId: SANDBOX_ENTITY_TEXTURE_ID,
                  width: 8,
                  height: 4,
                  tint: 0xdd3627,
                  depth: 1
                }
              }
            ]
          }
        ],
        tags: ["sandbox", "complex", "object-tree"]
      } satisfies RenderObjectDefinition
    ],
    renderRig: [
      {
        id: SANDBOX_ENTITY_RENDER_RIG_ID,
        renderObjectId: SANDBOX_ENTITY_RENDER_OBJECT_ID,
        nodeAnimations: [
          {
            kind: "pulse",
            nodePath: "aura",
            scale: 0.16,
            speed: 2.4,
            alpha: { min: 0.18, max: 0.44 }
          },
          { kind: "spin", nodePath: "body", speed: 1.3 },
          { kind: "orbit", nodePath: "marker", radius: 3.5, speed: 2.1, phase: 0.5 },
          {
            kind: "pulse",
            nodePath: "thruster/left",
            scale: 0.24,
            speed: 8,
            phase: 0.2,
            alpha: { min: 0.25, max: 0.9 }
          },
          {
            kind: "pulse",
            nodePath: "thruster/right",
            scale: 0.24,
            speed: 8,
            phase: 1.1,
            alpha: { min: 0.25, max: 0.9 }
          }
        ],
        tags: ["sandbox", "animated", "node-updates"]
      } satisfies SandboxRenderRigDefinition
    ],
    actor: [
      {
        id: SANDBOX_ACTOR_ID,
        name: "Scout Swarm",
        entityCount: 5,
        baseSpeed: 24,
        renderRigId: SANDBOX_ENTITY_RENDER_RIG_ID,
        abilityIds: ["ability.sandbox.phase_dash", "ability.sandbox.signal_ping"],
        tags: ["sandbox", "runtime-seed", "complex-data"]
      } satisfies SandboxActorDefinition
    ],
    ability: [
      {
        id: "ability.sandbox.phase_dash",
        name: "Phase Dash",
        cooldownMs: 1600,
        trigger: { type: "input.action", actionId: "game.confirm" },
        costs: [{ resource: "energy", amount: 18 }],
        effects: [
          { type: "movement.impulse", params: { distance: 64, durationMs: 180 } },
          {
            type: "renderer.command",
            params: { command: "animation.play", animationId: "dash-flash" }
          }
        ],
        tags: ["sandbox", "ability", "movement"]
      } satisfies SandboxAbilityDefinition,
      {
        id: "ability.sandbox.signal_ping",
        name: "Signal Ping",
        cooldownMs: 2400,
        trigger: { type: "runtime.interval", everyTicks: 180 },
        costs: [],
        effects: [
          { type: "event.emit", params: { eventType: "sandbox.signal_ping" } },
          { type: "renderer.nodePulse", params: { nodePath: "aura", intensity: 0.5 } }
        ],
        tags: ["sandbox", "ability", "diagnostic"]
      } satisfies SandboxAbilityDefinition
    ],
    biome: [
      {
        id: "biome.sandbox.neon_ruins",
        name: "Neon Ruins",
        navigation: {
          friction: 0.08,
          preferredAltitude: 0,
          hazards: [
            { id: "heat-haze", severity: 0.2, bounds: { x: 12, y: 18, width: 28, height: 16 } },
            { id: "signal-fog", severity: 0.35, bounds: { x: 58, y: 42, width: 20, height: 24 } }
          ]
        },
        lighting: {
          ambient: 0x10100e,
          accents: [0x7fd16b, 0xdd3627, 0x64c2d0]
        },
        tags: ["sandbox", "environment"]
      } satisfies SandboxBiomeDefinition
    ],
    spawnProfile: [
      {
        id: "spawn.sandbox.scout_patrol",
        actorId: SANDBOX_ACTOR_ID,
        biomeId: "biome.sandbox.neon_ruins",
        formation: {
          type: "arc",
          radius: 36,
          jitter: 0.18
        },
        waves: [
          { delayMs: 0, count: 3 },
          { delayMs: 1200, count: 2 }
        ],
        tags: ["sandbox", "spawn"]
      } satisfies SandboxSpawnProfileDefinition
    ]
  }
};

export function createSandboxDataRegistry(): DataRegistry {
  const registry = createDataRegistry();
  registry.registerKind(createAssetDataKind({ supportedTypes: ["image", "spritesheet"] }));
  registry.registerKind(createRenderObjectDataKind(["debug.square", "sprite", "container"]));
  registry.registerKind(createRenderRigDataKind());
  registry.registerKind(createActorDataKind());
  registry.registerKind(createAbilityDataKind());
  registry.registerKind(createBiomeDataKind());
  registry.registerKind(createSpawnProfileDataKind());
  registry.registerPack(sandboxDataPack);
  return registry;
}

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

export function getSandboxActorDefinition(registry: DataRegistry): SandboxActorDefinition {
  return registry.getValue<SandboxActorDefinition>("actor", SANDBOX_ACTOR_ID);
}

export function getSandboxRenderRigDefinition(registry: DataRegistry): SandboxRenderRigDefinition {
  return registry.getValue<SandboxRenderRigDefinition>("renderRig", SANDBOX_ENTITY_RENDER_RIG_ID);
}

export function getSandboxEntityRenderObject(registry: DataRegistry): RenderObjectDefinition {
  return registry.getValue<RenderObjectDefinition>("renderObject", SANDBOX_ENTITY_RENDER_OBJECT_ID);
}

function createRenderObjectDataKind(
  supportedTypes: RenderObjectType[]
): DataKindDefinition<RenderObjectDefinition> {
  const supported = new Set(supportedTypes);

  return {
    kind: "renderObject",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return collectRenderObjectAssetReferences(document.value);
    },
    validate(document) {
      return collectUnsupportedRenderTypes(document.value, supported).map((entry) => ({
        code: "sandbox.unknown_render_type",
        message: `Unsupported sandbox render object type: ${entry.type}`,
        severity: "error" as const,
        key: document,
        path: entry.path
      }));
    }
  };
}

function createRenderRigDataKind(): DataKindDefinition<SandboxRenderRigDefinition> {
  return {
    kind: "renderRig",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [{ kind: "renderObject", id: document.value.renderObjectId, path: "renderObjectId" }];
    },
    validate(document) {
      return document.value.nodeAnimations.length === 0
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

function createActorDataKind(): DataKindDefinition<SandboxActorDefinition> {
  return {
    kind: "actor",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        { kind: "renderRig", id: document.value.renderRigId, path: "renderRigId" },
        ...document.value.abilityIds.map((id, index) => ({
          kind: "ability",
          id,
          path: `abilityIds[${index}]`
        }))
      ];
    },
    validate(document) {
      const diagnostics = [];

      if (document.value.entityCount < 1) {
        diagnostics.push({
          code: "sandbox.actor_invalid_entity_count",
          message: "Sandbox actor entityCount must be at least 1",
          severity: "error" as const,
          key: document
        });
      }

      if (document.value.baseSpeed <= 0) {
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

function createAbilityDataKind(): DataKindDefinition<SandboxAbilityDefinition> {
  return {
    kind: "ability",
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      return document.value.cooldownMs < 0
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

function createBiomeDataKind(): DataKindDefinition<SandboxBiomeDefinition> {
  return {
    kind: "biome",
    getTags: (definition) => definition.tags ?? [],
    indexes: [
      {
        id: "hazard",
        values(document) {
          return document.value.navigation.hazards.map((hazard) => hazard.id);
        }
      }
    ],
    validate(document) {
      return document.value.navigation.friction < 0
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

function createSpawnProfileDataKind(): DataKindDefinition<SandboxSpawnProfileDefinition> {
  return {
    kind: "spawnProfile",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        { kind: "actor", id: document.value.actorId, path: "actorId" },
        { kind: "biome", id: document.value.biomeId, path: "biomeId" }
      ];
    },
    validate(document) {
      return document.value.waves.some((wave) => wave.count < 1)
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
): Array<{ kind: string; id: string; path: string }> {
  const references = collectNodeAssetReferences(definition, "props.textureId");
  for (const child of definition.children ?? []) {
    references.push(...collectNodeAssetReferences(child, `children.${child.id ?? child.type}`));
  }

  return references;
}

function collectNodeAssetReferences(
  definition: RenderObjectDefinition | RenderNodeDefinition,
  path: string
): Array<{ kind: string; id: string; path: string }> {
  const textureId =
    typeof definition.props?.textureId === "string" ? definition.props.textureId : undefined;
  const references = textureId ? [{ kind: "asset", id: textureId, path }] : [];

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
