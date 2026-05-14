import { createAssetDataKind, type AssetDefinition } from "@gamekit/asset";
import {
  createDataRegistry,
  type DataKindDefinition,
  type DataPack,
  type DataRegistry
} from "@gamekit/data";
import {
  createGasDataKinds,
  type GasAbilityDefinition,
  type GasActorDefinition,
  type GasAttributeDefinition,
  type GasCueDefinition,
  type GasEffectDefinition,
  type GasTagDefinition
} from "@gamekit/gas";
import { createTcaRuleDataKind, type TcaRule } from "@gamekit/tca";
import type {
  RenderNodeDefinition,
  RenderObjectDefinition,
  RenderObjectType
} from "@gamekit/renderer-core";
import type { SandboxRenderNodeAnimation, SandboxSceneRole } from "./components";

export const SANDBOX_ASSET_GROUP = "sandbox.preload";
export const SANDBOX_ACTOR_ID = "actor.sandbox.scout_swarm";
export const SANDBOX_GAS_ACTOR_DEFINITION_ID = "gas.actor.sandbox.scout";
export const SANDBOX_ENTITY_RENDER_OBJECT_ID = "render.sandbox.entity";
export const SANDBOX_ENTITY_RENDER_RIG_ID = "renderRig.sandbox.scout_swarm";
export const SANDBOX_SIGNAL_OUTPOST_LAYOUT_ID = "sceneLayout.sandbox.signal_outpost";

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
      } satisfies RenderObjectDefinition,
      createOutpostRenderObject("render.sandbox.command_core", "command-core"),
      createOutpostRenderObject("render.sandbox.relay_tower", "relay-tower"),
      createOutpostRenderObject("render.sandbox.scout", "scout"),
      createOutpostRenderObject("render.sandbox.data_node", "data-node"),
      createOutpostRenderObject("render.sandbox.asset_fabricator", "asset-fabricator"),
      createOutpostRenderObject("render.sandbox.interference_node", "interference-node"),
      createSignalLinkRenderObject()
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
      } satisfies SandboxRenderRigDefinition,
      createOutpostRenderRig("renderRig.sandbox.command_core", "render.sandbox.command_core", [
        { kind: "pulse", nodePath: "aura", scale: 0.08, speed: 2, alpha: { min: 0.2, max: 0.52 } },
        { kind: "spin", nodePath: "outer", speed: 0.45 },
        { kind: "spin", nodePath: "inner", speed: -0.8 }
      ]),
      createOutpostRenderRig("renderRig.sandbox.relay_tower", "render.sandbox.relay_tower", [
        { kind: "pulse", nodePath: "charge/ring", scale: 0.12, speed: 3.2 },
        {
          kind: "pulse",
          nodePath: "beacon",
          scale: 0.18,
          speed: 4.4,
          alpha: { min: 0.35, max: 0.9 }
        }
      ]),
      createOutpostRenderRig("renderRig.sandbox.scout", "render.sandbox.scout", [
        {
          kind: "pulse",
          nodePath: "cargo",
          scale: 0.15,
          speed: 5.2,
          alpha: { min: 0.2, max: 0.82 }
        },
        { kind: "pulse", nodePath: "task", scale: 0.1, speed: 4.5 }
      ]),
      createOutpostRenderRig("renderRig.sandbox.data_node", "render.sandbox.data_node", [
        { kind: "pulse", nodePath: "core", scale: 0.08, speed: 2.8 }
      ]),
      createOutpostRenderRig(
        "renderRig.sandbox.asset_fabricator",
        "render.sandbox.asset_fabricator",
        [{ kind: "spin", nodePath: "gear", speed: 0.9 }]
      ),
      createOutpostRenderRig(
        "renderRig.sandbox.interference_node",
        "render.sandbox.interference_node",
        [
          {
            kind: "pulse",
            nodePath: "field",
            scale: 0.18,
            speed: 2.4,
            alpha: { min: 0.15, max: 0.5 }
          },
          { kind: "spin", nodePath: "core", speed: -1.1 }
        ]
      )
    ],
    sceneObject: [
      {
        id: "scene.sandbox.command_core",
        label: "Command Core",
        role: "command-core",
        x: 50,
        y: 50,
        renderObjectId: "render.sandbox.command_core",
        renderRigId: "renderRig.sandbox.command_core",
        gasActorDefinitionId: "gas.actor.sandbox.station",
        stationDefinitionId: "station.sandbox.command_core",
        capacity: 260,
        tags: ["sandbox", "station", "objective"]
      } satisfies SandboxSceneObjectDefinition,
      {
        id: "scene.sandbox.relay_northwest",
        label: "Relay NW",
        role: "relay-tower",
        x: 24,
        y: 30,
        renderObjectId: "render.sandbox.relay_tower",
        renderRigId: "renderRig.sandbox.relay_tower",
        gasActorDefinitionId: "gas.actor.sandbox.station",
        stationDefinitionId: "station.sandbox.relay_northwest",
        capacity: 80,
        productionRate: 7,
        productionRecipeId: "recipe.sandbox.signal_pulse",
        tags: ["sandbox", "station", "producer"]
      } satisfies SandboxSceneObjectDefinition,
      {
        id: "scene.sandbox.relay_north",
        label: "Relay North",
        role: "relay-tower",
        x: 50,
        y: 20,
        renderObjectId: "render.sandbox.relay_tower",
        renderRigId: "renderRig.sandbox.relay_tower",
        gasActorDefinitionId: "gas.actor.sandbox.station",
        stationDefinitionId: "station.sandbox.relay_north",
        capacity: 90,
        productionRate: 8,
        productionRecipeId: "recipe.sandbox.signal_pulse",
        tags: ["sandbox", "station", "producer"]
      } satisfies SandboxSceneObjectDefinition,
      {
        id: "scene.sandbox.relay_east",
        label: "Relay East",
        role: "relay-tower",
        x: 76,
        y: 34,
        renderObjectId: "render.sandbox.relay_tower",
        renderRigId: "renderRig.sandbox.relay_tower",
        gasActorDefinitionId: "gas.actor.sandbox.station",
        stationDefinitionId: "station.sandbox.relay_east",
        capacity: 80,
        productionRate: 7.5,
        productionRecipeId: "recipe.sandbox.signal_pulse",
        tags: ["sandbox", "station", "producer"]
      } satisfies SandboxSceneObjectDefinition,
      {
        id: "scene.sandbox.data_node",
        label: "Data Node",
        role: "data-node",
        x: 20,
        y: 74,
        renderObjectId: "render.sandbox.data_node",
        renderRigId: "renderRig.sandbox.data_node",
        stationDefinitionId: "station.sandbox.data_node",
        capacity: 40,
        productionRecipeId: "recipe.sandbox.rule_decode",
        tags: ["sandbox", "data", "definition"]
      } satisfies SandboxSceneObjectDefinition,
      {
        id: "scene.sandbox.asset_fabricator",
        label: "Asset Fabricator",
        role: "asset-fabricator",
        x: 80,
        y: 74,
        renderObjectId: "render.sandbox.asset_fabricator",
        renderRigId: "renderRig.sandbox.asset_fabricator",
        stationDefinitionId: "station.sandbox.asset_fabricator",
        capacity: 40,
        productionRecipeId: "recipe.sandbox.module_fragment",
        tags: ["sandbox", "asset", "loader"]
      } satisfies SandboxSceneObjectDefinition,
      {
        id: "scene.sandbox.interference",
        label: "Interference Node",
        role: "interference-node",
        x: 50,
        y: 86,
        renderObjectId: "render.sandbox.interference_node",
        renderRigId: "renderRig.sandbox.interference_node",
        gasActorDefinitionId: "gas.actor.sandbox.interference",
        stationDefinitionId: "station.sandbox.interference",
        capacity: 0,
        tags: ["sandbox", "threat"]
      } satisfies SandboxSceneObjectDefinition
    ],
    station: [
      createStationDefinition("station.sandbox.command_core", "Command Core", "core", 5, [
        "deliver",
        "repair"
      ]),
      createStationDefinition("station.sandbox.relay_northwest", "Relay NW", "signal-field", 4, [
        "collect",
        "repair"
      ]),
      createStationDefinition("station.sandbox.relay_north", "Relay North", "signal-field", 5, [
        "collect",
        "repair"
      ]),
      createStationDefinition("station.sandbox.relay_east", "Relay East", "signal-field", 4, [
        "collect",
        "repair"
      ]),
      createStationDefinition("station.sandbox.data_node", "Data Node", "archive-wing", 3, [
        "deliver",
        "scan",
        "repair"
      ]),
      createStationDefinition(
        "station.sandbox.asset_fabricator",
        "Asset Fabricator",
        "fabrication-bay",
        3,
        ["deliver", "scan", "repair"]
      ),
      createStationDefinition("station.sandbox.interference", "Interference Node", "rift", 6, [
        "suppress",
        "scan"
      ])
    ],
    productionRecipe: [
      {
        id: "recipe.sandbox.signal_pulse",
        label: "Signal Pulse",
        input: [],
        output: { resource: "signal", amount: 1 },
        durationMs: 1000,
        stationRole: "relay-tower",
        tags: ["sandbox", "production", "signal"]
      } satisfies SandboxProductionRecipeDefinition,
      {
        id: "recipe.sandbox.core_uplink",
        label: "Core Uplink",
        input: [{ resource: "signal", amount: 40 }],
        output: { resource: "objective", amount: 40 },
        durationMs: 1500,
        stationRole: "command-core",
        tags: ["sandbox", "production", "objective"]
      } satisfies SandboxProductionRecipeDefinition,
      {
        id: "recipe.sandbox.module_fragment",
        label: "Module Fragment",
        input: [{ resource: "signal", amount: 18 }],
        output: { resource: "fragment", amount: 1 },
        durationMs: 2200,
        stationRole: "asset-fabricator",
        tags: ["sandbox", "production", "asset"]
      } satisfies SandboxProductionRecipeDefinition,
      {
        id: "recipe.sandbox.rule_decode",
        label: "Rule Decode",
        input: [{ resource: "fragment", amount: 2 }],
        output: { resource: "unlock", amount: 1 },
        durationMs: 3200,
        stationRole: "data-node",
        tags: ["sandbox", "production", "data"]
      } satisfies SandboxProductionRecipeDefinition
    ],
    objectivePhase: [
      {
        id: "objective.sandbox.phase.bootstrap",
        label: "Bootstrap Uplink",
        targetSignal: 220,
        unlocks: ["mode.stabilize"],
        reward: "Enable station stabilize automation",
        tags: ["sandbox", "objective"]
      } satisfies SandboxObjectivePhaseDefinition,
      {
        id: "objective.sandbox.phase.fabricate",
        label: "Fabricate Relay Mesh",
        targetSignal: 420,
        unlocks: ["recipe.sandbox.module_fragment", "mode.boost"],
        reward: "Enable boost mode and visible fabricator layers",
        tags: ["sandbox", "objective", "asset"]
      } satisfies SandboxObjectivePhaseDefinition,
      {
        id: "objective.sandbox.phase.decode",
        label: "Decode Counter-Rules",
        targetSignal: 720,
        unlocks: ["recipe.sandbox.rule_decode", "mode.suppress"],
        reward: "Enable interference suppression automation",
        tags: ["sandbox", "objective", "data"]
      } satisfies SandboxObjectivePhaseDefinition
    ],
    threatProfile: [
      {
        id: "threat.sandbox.signal_storm",
        label: "Signal Storm",
        cadenceTicks: 150,
        effectId: "gas.effect.sandbox.interference_mark",
        targetRoles: ["relay-tower", "command-core"],
        tags: ["sandbox", "threat", "signal"]
      } satisfies SandboxThreatProfileDefinition,
      {
        id: "threat.sandbox.data_corruption",
        label: "Data Corruption",
        cadenceTicks: 210,
        effectId: "gas.effect.sandbox.interference_mark",
        targetRoles: ["data-node"],
        tags: ["sandbox", "threat", "data"]
      } satisfies SandboxThreatProfileDefinition,
      {
        id: "threat.sandbox.scout_jam",
        label: "Scout Jam",
        cadenceTicks: 180,
        effectId: "gas.effect.sandbox.signal_damage",
        targetRoles: ["scout"],
        tags: ["sandbox", "threat", "worker"]
      } satisfies SandboxThreatProfileDefinition
    ],
    outpostRoute: [
      createRouteDefinition(
        "route.relay_northwest.core",
        "scene.sandbox.relay_northwest",
        "scene.sandbox.command_core",
        42
      ),
      createRouteDefinition(
        "route.relay_north.core",
        "scene.sandbox.relay_north",
        "scene.sandbox.command_core",
        46
      ),
      createRouteDefinition(
        "route.relay_east.core",
        "scene.sandbox.relay_east",
        "scene.sandbox.command_core",
        42
      ),
      createRouteDefinition(
        "route.data.core",
        "scene.sandbox.data_node",
        "scene.sandbox.command_core",
        28
      ),
      createRouteDefinition(
        "route.asset.core",
        "scene.sandbox.asset_fabricator",
        "scene.sandbox.command_core",
        28
      ),
      createRouteDefinition(
        "route.interference.core",
        "scene.sandbox.interference",
        "scene.sandbox.command_core",
        20
      ),
      createRouteDefinition(
        "route.data.asset",
        "scene.sandbox.data_node",
        "scene.sandbox.asset_fabricator",
        16
      )
    ],
    sceneLayout: [
      {
        id: SANDBOX_SIGNAL_OUTPOST_LAYOUT_ID,
        name: "Signal Outpost",
        objectIds: [
          "scene.sandbox.command_core",
          "scene.sandbox.relay_northwest",
          "scene.sandbox.relay_north",
          "scene.sandbox.relay_east",
          "scene.sandbox.data_node",
          "scene.sandbox.asset_fabricator",
          "scene.sandbox.interference"
        ],
        links: [
          {
            id: "link.relay_northwest.core",
            fromObjectId: "scene.sandbox.relay_northwest",
            toObjectId: "scene.sandbox.command_core",
            routeId: "route.relay_northwest.core"
          },
          {
            id: "link.relay_north.core",
            fromObjectId: "scene.sandbox.relay_north",
            toObjectId: "scene.sandbox.command_core",
            routeId: "route.relay_north.core"
          },
          {
            id: "link.relay_east.core",
            fromObjectId: "scene.sandbox.relay_east",
            toObjectId: "scene.sandbox.command_core",
            routeId: "route.relay_east.core"
          },
          {
            id: "link.data.core",
            fromObjectId: "scene.sandbox.data_node",
            toObjectId: "scene.sandbox.command_core",
            routeId: "route.data.core"
          },
          {
            id: "link.asset.core",
            fromObjectId: "scene.sandbox.asset_fabricator",
            toObjectId: "scene.sandbox.command_core",
            routeId: "route.asset.core"
          },
          {
            id: "link.interference.core",
            fromObjectId: "scene.sandbox.interference",
            toObjectId: "scene.sandbox.command_core",
            routeId: "route.interference.core",
            corrupted: true
          }
        ],
        scoutCount: 5,
        tags: ["sandbox", "layout", "signal-outpost"]
      } satisfies SandboxSceneLayoutDefinition
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
    "gas.attribute": [
      {
        id: "health",
        name: "Health",
        min: 0,
        max: 120,
        defaultValue: 100,
        tags: ["gas", "vital"]
      } satisfies GasAttributeDefinition,
      {
        id: "energy",
        name: "Energy",
        min: 0,
        max: 80,
        defaultValue: 40,
        tags: ["gas", "resource"]
      } satisfies GasAttributeDefinition,
      {
        id: "signal",
        name: "Signal",
        min: 0,
        max: 100,
        defaultValue: 12,
        tags: ["gas", "resource"]
      } satisfies GasAttributeDefinition,
      {
        id: "stability",
        name: "Stability",
        min: 0,
        max: 100,
        defaultValue: 100,
        tags: ["gas", "station"]
      } satisfies GasAttributeDefinition,
      {
        id: "throughput",
        name: "Throughput",
        min: 0,
        max: 200,
        defaultValue: 60,
        tags: ["gas", "production"]
      } satisfies GasAttributeDefinition
    ],
    "gas.tag": [
      {
        id: "team.scout",
        name: "Scout Team",
        tags: ["sandbox", "team"]
      } satisfies GasTagDefinition,
      {
        id: "state.overcharged",
        name: "Overcharged",
        tags: ["sandbox", "state"]
      } satisfies GasTagDefinition,
      {
        id: "state.marked",
        name: "Marked",
        tags: ["sandbox", "state"]
      } satisfies GasTagDefinition,
      {
        id: "state.interfered",
        name: "Interfered",
        tags: ["sandbox", "state"]
      } satisfies GasTagDefinition
    ],
    "gas.cue": [
      {
        id: "cue.sandbox.signal_hit",
        type: "ui.floating_text",
        payload: { text: "-7 signal", tone: "warning" },
        tags: ["sandbox", "cue", "ui"]
      } satisfies GasCueDefinition,
      {
        id: "cue.sandbox.pulse",
        type: "renderer.node_pulse",
        payload: { nodePath: "aura", intensity: 0.7 },
        tags: ["sandbox", "cue", "renderer"]
      } satisfies GasCueDefinition
    ],
    "gas.effect": [
      {
        id: "gas.effect.sandbox.signal_damage",
        name: "Signal Damage",
        attributeModifiers: [{ attribute: "health", operation: "add", value: -7 }],
        grantedTags: ["state.marked"],
        durationMs: 600,
        cues: ["cue.sandbox.signal_hit"],
        tags: ["sandbox", "effect", "damage"]
      } satisfies GasEffectDefinition,
      {
        id: "gas.effect.sandbox.overcharge_regen",
        name: "Overcharge Regen",
        durationMs: 1000,
        periodMs: 250,
        periodicModifiers: [{ attribute: "energy", operation: "add", value: 2 }],
        grantedTags: ["state.overcharged"],
        cues: ["cue.sandbox.pulse"],
        tags: ["sandbox", "effect", "periodic"]
      } satisfies GasEffectDefinition,
      {
        id: "gas.effect.sandbox.interference_mark",
        name: "Interference Mark",
        attributeModifiers: [{ attribute: "stability", operation: "add", value: -8 }],
        grantedTags: ["state.interfered"],
        durationMs: 1200,
        cues: ["cue.sandbox.signal_hit"],
        tags: ["sandbox", "effect", "threat"]
      } satisfies GasEffectDefinition,
      {
        id: "gas.effect.sandbox.field_repair",
        name: "Field Repair",
        durationMs: 1400,
        periodMs: 350,
        periodicModifiers: [{ attribute: "stability", operation: "add", value: 4 }],
        cues: ["cue.sandbox.pulse"],
        tags: ["sandbox", "effect", "repair"]
      } satisfies GasEffectDefinition,
      {
        id: "gas.effect.sandbox.signal_boost",
        name: "Signal Boost",
        durationMs: 1800,
        attributeModifiers: [{ attribute: "throughput", operation: "add", value: 20 }],
        grantedTags: ["state.overcharged"],
        cues: ["cue.sandbox.pulse"],
        tags: ["sandbox", "effect", "boost"]
      } satisfies GasEffectDefinition
    ],
    "gas.ability": [
      {
        id: "gas.ability.sandbox.signal_strike",
        name: "Signal Strike",
        costs: [{ attribute: "energy", amount: 3 }],
        cooldownMs: 200,
        effects: [{ effectId: "gas.effect.sandbox.signal_damage", target: "target" }],
        tags: ["sandbox", "ability", "attack"]
      } satisfies GasAbilityDefinition,
      {
        id: "gas.ability.sandbox.overcharge",
        name: "Overcharge",
        cooldownMs: 500,
        effects: [{ effectId: "gas.effect.sandbox.overcharge_regen", target: "self" }],
        cues: ["cue.sandbox.pulse"],
        tags: ["sandbox", "ability", "periodic"]
      } satisfies GasAbilityDefinition,
      {
        id: "gas.ability.sandbox.overcharge_relay",
        name: "Overcharge Relay",
        cooldownMs: 900,
        effects: [{ effectId: "gas.effect.sandbox.signal_boost", target: "self" }],
        cues: ["cue.sandbox.pulse"],
        tags: ["sandbox", "ability", "station"]
      } satisfies GasAbilityDefinition,
      {
        id: "gas.ability.sandbox.field_repair",
        name: "Field Repair",
        costs: [{ attribute: "energy", amount: 4 }],
        cooldownMs: 600,
        effects: [{ effectId: "gas.effect.sandbox.field_repair", target: "target" }],
        tags: ["sandbox", "ability", "repair"]
      } satisfies GasAbilityDefinition
    ],
    "gas.actor": [
      {
        id: SANDBOX_GAS_ACTOR_DEFINITION_ID,
        name: "Scout",
        attributes: { health: 100, energy: 40, signal: 12 },
        tags: ["team.scout"],
        abilities: ["gas.ability.sandbox.signal_strike", "gas.ability.sandbox.overcharge"],
        metadata: { role: "sandbox-validation" }
      } satisfies GasActorDefinition,
      {
        id: "gas.actor.sandbox.station",
        name: "Outpost Station",
        attributes: { health: 120, energy: 30, signal: 0, stability: 100, throughput: 60 },
        tags: ["team.scout"],
        abilities: ["gas.ability.sandbox.overcharge_relay"],
        metadata: { role: "station" }
      } satisfies GasActorDefinition,
      {
        id: "gas.actor.sandbox.interference",
        name: "Interference Node",
        attributes: { health: 160, energy: 80, signal: 0, stability: 100, throughput: 0 },
        tags: ["state.marked"],
        abilities: ["gas.ability.sandbox.signal_strike"],
        metadata: { role: "threat" }
      } satisfies GasActorDefinition
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
    ],
    tcaRule: [
      {
        id: "rule.sandbox.confirm_signal",
        trigger: {
          type: "sandbox.input_action",
          args: { actionId: "game.confirm", phase: "pressed" }
        },
        conditions: [
          {
            type: "sandbox.entity_count",
            args: { min: 5, max: 32 }
          }
        ],
        actions: [
          {
            type: "sandbox.log",
            args: { message: "Confirm input routed through TCA" }
          },
          {
            type: "event.emit",
            args: {
              eventType: "sandbox.tca_confirmed",
              payload: { ruleId: "rule.sandbox.confirm_signal" }
            }
          }
        ],
        priority: 10,
        tags: ["sandbox", "tca", "input"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.motion_heartbeat",
        trigger: { type: "sandbox.motion_interval", args: { everyTicks: 120 } },
        conditions: [
          {
            type: "sandbox.data_tag_exists",
            args: { kind: "ability", tag: "diagnostic" }
          }
        ],
        actions: [
          {
            type: "sandbox.log",
            args: { message: "Motion heartbeat observed by TCA" }
          },
          {
            type: "sandbox.data_summary",
            args: { kind: "ability" }
          }
        ],
        priority: 3,
        tags: ["sandbox", "tca", "runtime"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.camera_input_trace",
        trigger: {
          type: "sandbox.input_action",
          args: {
            actionIds: [
              "camera.pan_up",
              "camera.pan_down",
              "camera.pan_left",
              "camera.pan_right",
              "camera.zoom_in",
              "camera.zoom_out"
            ]
          }
        },
        actions: [
          {
            type: "sandbox.log",
            args: { message: "Camera input was routed through the scoped game viewport" }
          },
          {
            type: "event.emit",
            args: {
              eventType: "sandbox.tca_camera_input",
              payload: { group: "camera" }
            }
          }
        ],
        priority: 5,
        tags: ["sandbox", "tca", "camera"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.spawn_catalog_once",
        trigger: { type: "event.type", args: { eventType: "sandbox.entity_spawned" } },
        conditions: [
          {
            type: "sandbox.entity_count",
            args: { min: 1 }
          }
        ],
        actions: [
          {
            type: "sandbox.data_summary",
            args: { kind: "spawnProfile" }
          },
          {
            type: "event.emit",
            args: {
              eventType: "sandbox.tca_spawn_catalog_ready",
              payload: { sourceRule: "rule.sandbox.spawn_catalog_once" }
            }
          }
        ],
        once: true,
        priority: 20,
        tags: ["sandbox", "tca", "data", "once"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.gas_signal_strike",
        trigger: { type: "event.type", args: { eventType: "sandbox.motion_tick" } },
        conditions: [
          {
            type: "gas.attribute.compare",
            args: {
              actorId: "gas.actor.sandbox.scout.0",
              attribute: "energy",
              operator: ">=",
              value: 3
            }
          },
          {
            type: "gas.attribute.compare",
            args: {
              actorId: "gas.actor.sandbox.scout.1",
              attribute: "health",
              operator: ">",
              value: 0
            }
          }
        ],
        actions: [
          {
            type: "gas.activate_ability",
            args: {
              actorId: "gas.actor.sandbox.scout.0",
              abilityId: "gas.ability.sandbox.signal_strike",
              targetActorId: "gas.actor.sandbox.scout.1"
            }
          }
        ],
        priority: 15,
        tags: ["sandbox", "tca", "gas", "ability"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.gas_overcharge",
        trigger: {
          type: "sandbox.input_action",
          args: { actionId: "game.confirm", phase: "pressed" }
        },
        conditions: [
          {
            type: "gas.actor.has_tag",
            args: { actorId: "gas.actor.sandbox.scout.0", tag: "team.scout" }
          }
        ],
        actions: [
          {
            type: "gas.activate_ability",
            args: {
              actorId: "gas.actor.sandbox.scout.0",
              abilityId: "gas.ability.sandbox.overcharge",
              targetActorId: "gas.actor.sandbox.scout.0"
            }
          }
        ],
        priority: 16,
        tags: ["sandbox", "tca", "gas", "input"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.interference_response",
        trigger: { type: "event.type", args: { eventType: "sandbox.interference_strike" } },
        actions: [
          {
            type: "sandbox.log",
            args: { message: "Interference strike routed to field repair response" }
          },
          {
            type: "gas.activate_ability",
            args: {
              actorId: "gas.actor.sandbox.scout.0",
              abilityId: "gas.ability.sandbox.field_repair",
              targetActorId: "gas.actor.sandbox.relay.northwest"
            }
          }
        ],
        priority: 18,
        tags: ["sandbox", "tca", "gas", "threat"]
      } satisfies TcaRule,
      {
        id: "rule.sandbox.objective_milestone",
        trigger: { type: "event.type", args: { eventType: "sandbox.objective_progress" } },
        actions: [
          {
            type: "sandbox.log",
            args: { message: "Command Core progress observed by TCA" }
          }
        ],
        priority: 4,
        tags: ["sandbox", "tca", "objective"]
      } satisfies TcaRule
    ]
  }
};

export function createSandboxDataRegistry(): DataRegistry {
  const registry = createDataRegistry();
  registry.registerKind(createAssetDataKind({ supportedTypes: ["image", "spritesheet"] }));
  registry.registerKind(createRenderObjectDataKind(["debug.square", "sprite", "container"]));
  registry.registerKind(createRenderRigDataKind());
  registry.registerKind(createSceneObjectDataKind());
  registry.registerKind(createStationDataKind());
  registry.registerKind(createProductionRecipeDataKind());
  registry.registerKind(createObjectivePhaseDataKind());
  registry.registerKind(createThreatProfileDataKind());
  registry.registerKind(createOutpostRouteDataKind());
  registry.registerKind(createSceneLayoutDataKind());
  registry.registerKind(createActorDataKind());
  registry.registerKind(createAbilityDataKind());
  for (const kind of createGasDataKinds()) {
    registry.registerKind(kind);
  }
  registry.registerKind(createBiomeDataKind());
  registry.registerKind(createSpawnProfileDataKind());
  registry.registerKind(createTcaRuleDataKind());
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

export function getSandboxActorDefinition(registry: DataRegistry): SandboxActorDefinition {
  return registry.getValue<SandboxActorDefinition>("actor", SANDBOX_ACTOR_ID);
}

export function getSandboxRenderRigDefinition(registry: DataRegistry): SandboxRenderRigDefinition {
  return registry.getValue<SandboxRenderRigDefinition>("renderRig", SANDBOX_ENTITY_RENDER_RIG_ID);
}

export function getSandboxEntityRenderObject(registry: DataRegistry): RenderObjectDefinition {
  return registry.getValue<RenderObjectDefinition>("renderObject", SANDBOX_ENTITY_RENDER_OBJECT_ID);
}

export function getSandboxSignalOutpostLayout(
  registry: DataRegistry
): SandboxSceneLayoutDefinition {
  return registry.getValue<SandboxSceneLayoutDefinition>(
    "sceneLayout",
    SANDBOX_SIGNAL_OUTPOST_LAYOUT_ID
  );
}

export function getSandboxSceneObjects(
  registry: DataRegistry,
  layout: SandboxSceneLayoutDefinition
): SandboxSceneObjectDefinition[] {
  return layout.objectIds.map((id) =>
    registry.getValue<SandboxSceneObjectDefinition>("sceneObject", id)
  );
}

export function getSandboxRenderObject(registry: DataRegistry, id: string): RenderObjectDefinition {
  return registry.getValue<RenderObjectDefinition>("renderObject", id);
}

export function getSandboxRenderRig(
  registry: DataRegistry,
  id: string
): SandboxRenderRigDefinition {
  return registry.getValue<SandboxRenderRigDefinition>("renderRig", id);
}

export function getSandboxStationDefinition(
  registry: DataRegistry,
  id: string
): SandboxStationDefinition {
  return registry.getValue<SandboxStationDefinition>("station", id);
}

export function getSandboxObjectivePhase(
  registry: DataRegistry,
  id: string
): SandboxObjectivePhaseDefinition {
  return registry.getValue<SandboxObjectivePhaseDefinition>("objectivePhase", id);
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

function createSceneObjectDataKind(): DataKindDefinition<SandboxSceneObjectDefinition> {
  return {
    kind: "sceneObject",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      const references = [
        { kind: "renderObject", id: document.value.renderObjectId, path: "renderObjectId" }
      ];
      if (document.value.renderRigId) {
        references.push({
          kind: "renderRig",
          id: document.value.renderRigId,
          path: "renderRigId"
        });
      }
      if (document.value.gasActorDefinitionId) {
        references.push({
          kind: "gas.actor",
          id: document.value.gasActorDefinitionId,
          path: "gasActorDefinitionId"
        });
      }
      if (document.value.stationDefinitionId) {
        references.push({
          kind: "station",
          id: document.value.stationDefinitionId,
          path: "stationDefinitionId"
        });
      }
      if (document.value.productionRecipeId) {
        references.push({
          kind: "productionRecipe",
          id: document.value.productionRecipeId,
          path: "productionRecipeId"
        });
      }
      return references;
    },
    validate(document) {
      const diagnostics = [];
      if (
        document.value.x < 0 ||
        document.value.x > 100 ||
        document.value.y < 0 ||
        document.value.y > 100
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

function createStationDataKind(): DataKindDefinition<SandboxStationDefinition> {
  return {
    kind: "station",
    getTags: (definition) => definition.tags ?? [],
    indexes: [
      {
        id: "zone",
        values(document) {
          return [document.value.zone];
        }
      }
    ],
    validate(document) {
      const diagnostics = [];
      if (document.value.priority < 1) {
        diagnostics.push({
          code: "sandbox.station_invalid_priority",
          message: "Sandbox station priority must be at least 1",
          severity: "error" as const,
          key: document
        });
      }
      if (document.value.supportedTasks.length === 0) {
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

function createProductionRecipeDataKind(): DataKindDefinition<SandboxProductionRecipeDefinition> {
  return {
    kind: "productionRecipe",
    getTags: (definition) => definition.tags ?? [],
    indexes: [
      {
        id: "stationRole",
        values(document) {
          return [document.value.stationRole];
        }
      }
    ],
    validate(document) {
      return document.value.durationMs <= 0
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

function createObjectivePhaseDataKind(): DataKindDefinition<SandboxObjectivePhaseDefinition> {
  return {
    kind: "objectivePhase",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return document.value.unlocks
        .filter((id) => id.startsWith("recipe."))
        .map((id, index) => ({ kind: "productionRecipe", id, path: `unlocks[${index}]` }));
    },
    validate(document) {
      return document.value.targetSignal <= 0
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

function createThreatProfileDataKind(): DataKindDefinition<SandboxThreatProfileDefinition> {
  return {
    kind: "threatProfile",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [{ kind: "gas.effect", id: document.value.effectId, path: "effectId" }];
    },
    validate(document) {
      return document.value.cadenceTicks < 1
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

function createOutpostRouteDataKind(): DataKindDefinition<SandboxOutpostRouteDefinition> {
  return {
    kind: "outpostRoute",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        { kind: "sceneObject", id: document.value.fromObjectId, path: "fromObjectId" },
        { kind: "sceneObject", id: document.value.toObjectId, path: "toObjectId" }
      ];
    },
    validate(document) {
      return document.value.capacity <= 0
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

function createSceneLayoutDataKind(): DataKindDefinition<SandboxSceneLayoutDefinition> {
  return {
    kind: "sceneLayout",
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        ...document.value.objectIds.map((id, index) => ({
          kind: "sceneObject",
          id,
          path: `objectIds[${index}]`
        })),
        ...document.value.links.flatMap((link, index) => [
          {
            kind: "sceneObject",
            id: link.fromObjectId,
            path: `links[${index}].fromObjectId`
          },
          {
            kind: "sceneObject",
            id: link.toObjectId,
            path: `links[${index}].toObjectId`
          }
        ]),
        ...document.value.links
          .filter((link) => link.routeId)
          .map((link, index) => ({
            kind: "outpostRoute",
            id: link.routeId!,
            path: `links[${index}].routeId`
          }))
      ];
    },
    validate(document) {
      return document.value.scoutCount < 1
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

function createOutpostRenderRig(
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

function createStationDefinition(
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

function createRouteDefinition(
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

function createOutpostRenderObject(
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

function createSignalLinkRenderObject(): RenderObjectDefinition {
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
