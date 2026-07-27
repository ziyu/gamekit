import type { AssetAnimationManifest, AssetDefinition } from "@gamekit/asset";
import type {
  AnimatorBindingDefinition,
  AnimatorGraphDefinition,
  AnimationClipDefinition
} from "@gamekit/animator-core";
import type {
  CombatAbilityDeliveryDefinition,
  CombatDeliveryDefinition,
  CombatProjectileDefinition,
  CombatRelationshipPolicyDefinition
} from "@gamekit/combat";
import type { DataPackEntry } from "@gamekit/data";
import type {
  NavigationAgentProfileDefinition,
  NavigationLayoutDefinition
} from "@gamekit/navigation-core";
import type { NavigationGraphDefinition } from "@gamekit/navigation-graph";
import { outpostArenaDefinition } from "./arena-scene";

export const OUTPOST_NAVIGATION_BACKEND_ID = "outpost.graph";
export const OUTPOST_NAVIGATION_GRAPH_ID = "navigation.outpost.frontier.graph";
export const OUTPOST_NAVIGATION_LAYOUT_ID = "navigation.outpost.frontier.layout";
export const OUTPOST_NAVIGATION_PROFILE_ID = "navigation.outpost.raider";

export type OutpostNavigationBarricadeBlocker = {
  id: string;
  objectIds: readonly string[];
  edgeId: string;
};

export const outpostNavigationBarricadeBlockers: readonly OutpostNavigationBarricadeBlocker[] = [
  barricadeBlocker("north-west", "edge.outpost.north-west-inner"),
  barricadeBlocker("north-east", "edge.outpost.north-east-inner"),
  barricadeBlocker("south-west", "edge.outpost.south-west-inner"),
  barricadeBlocker("south-east", "edge.outpost.south-east-inner")
];

export const OUTPOST_AUDIO_ASSET_IDS = {
  ambience: "asset.outpost.audio.ambience",
  rifle: "asset.outpost.audio.rifle",
  enemyTelegraph: "asset.outpost.audio.enemy-telegraph",
  hit: "asset.outpost.audio.hit"
} as const;

const OUTPOST_ANIMATED_ASSETS = {
  "asset.outpost.player": "player",
  "asset.outpost.raider": "raider",
  "asset.outpost.overseer": "overseer"
} as const;

const relationshipPolicy: CombatRelationshipPolicyDefinition = {
  id: "combat.outpost.relationship.hostile",
  tags: ["outpost", "hostile-only"]
};

const projectile: CombatProjectileDefinition = {
  id: "combat.outpost.projectile.rifle",
  body: { type: "physics.body", id: "body.outpost.projectile" },
  lifetimeMs: 1_200,
  speed: 760,
  collisionMode: "ray-sweep",
  hitPolicy: "stop",
  maxHits: 1,
  query: { triggerInteraction: "include" },
  payloads: [{ effectId: "effect.outpost.combat_hit", target: "hit-actor" }],
  tags: ["outpost", "rifle"]
};

const deliveries: CombatDeliveryDefinition[] = [
  {
    id: "combat.outpost.delivery.rifle",
    delivery: {
      type: "projectile",
      projectile: { type: "combat.projectile", id: projectile.id }
    },
    payloads: [],
    relationshipPolicy: relationshipPolicy.id,
    tags: ["outpost", "rifle"]
  },
  {
    id: "combat.outpost.delivery.enemy-melee",
    delivery: {
      type: "melee",
      shape: { type: "circle", radius: 48 },
      selection: { mode: "closest", maxTargets: 1 }
    },
    payloads: [{ effectId: "effect.outpost.combat_hit", target: "hit-actor" }],
    relationshipPolicy: relationshipPolicy.id,
    tags: ["outpost", "enemy", "melee"]
  },
  {
    id: "combat.outpost.delivery.shock-field",
    delivery: {
      type: "area",
      shape: { type: "circle", radius: 150 },
      selection: { mode: "all", maxTargets: 64 }
    },
    payloads: [{ effectId: "effect.outpost.shocked", target: "hit-actor" }],
    relationshipPolicy: relationshipPolicy.id,
    tags: ["outpost", "shock"]
  }
];

const abilityDeliveries: CombatAbilityDeliveryDefinition[] = [
  binding("combat.outpost.binding.rifle", "ability.outpost.rifle_fire", deliveries[0]!.id),
  binding("combat.outpost.binding.enemy-melee", "ability.outpost.enemy_attack", deliveries[1]!.id),
  binding("combat.outpost.binding.shock-field", "ability.outpost.shock_field", deliveries[2]!.id)
];

const navigationProfile: NavigationAgentProfileDefinition = {
  id: OUTPOST_NAVIGATION_PROFILE_ID,
  radius: 16,
  height: 32,
  allowedAreas: ["lane", "objective"],
  costOverrides: { lane: 1, objective: 1.15 },
  tags: ["outpost", "enemy"]
};

const navigationGraph: NavigationGraphDefinition = {
  id: OUTPOST_NAVIGATION_GRAPH_ID,
  nodes: [
    node("gate.north", 900, 170, "lane"),
    node("north.west", 740, 350, "lane"),
    node("north.center", 900, 350, "lane"),
    node("north.east", 1060, 350, "lane"),
    node("gate.west", 270, 500, "lane"),
    node("west.outer", 520, 500, "lane"),
    node("west.inner", 740, 500, "lane"),
    node("objective", 900, 500, "objective"),
    node("east.inner", 1060, 500, "lane"),
    node("east.outer", 1280, 500, "lane"),
    node("gate.east", 1530, 500, "lane"),
    node("south.west", 740, 650, "lane"),
    node("south.center", 900, 650, "lane"),
    node("south.east", 1060, 650, "lane"),
    node("gate.south", 900, 830, "lane")
  ],
  edges: [
    edge("north-gate-west", "gate.north", "north.west"),
    edge("north-gate-center", "gate.north", "north.center"),
    edge("north-gate-east", "gate.north", "north.east"),
    edge("north-west-inner", "north.west", "west.inner"),
    edge("north-center-objective", "north.center", "objective", "objective"),
    edge("north-east-inner", "north.east", "east.inner"),
    edge("west-gate-outer", "gate.west", "west.outer"),
    edge("west-outer-inner", "west.outer", "west.inner"),
    edge("west-inner-objective", "west.inner", "objective", "objective"),
    edge("east-inner-objective", "east.inner", "objective", "objective"),
    edge("east-outer-inner", "east.outer", "east.inner"),
    edge("east-gate-outer", "gate.east", "east.outer"),
    edge("south-west-inner", "south.west", "west.inner"),
    edge("south-center-objective", "south.center", "objective", "objective"),
    edge("south-east-inner", "south.east", "east.inner"),
    edge("south-gate-west", "gate.south", "south.west"),
    edge("south-gate-center", "gate.south", "south.center"),
    edge("south-gate-east", "gate.south", "south.east"),
    edge("north-west-center", "north.west", "north.center"),
    edge("north-center-east", "north.center", "north.east"),
    edge("south-west-center", "south.west", "south.center"),
    edge("south-center-east", "south.center", "south.east")
  ],
  tags: ["outpost", "frontier", "authored"]
};

const navigationLayout: NavigationLayoutDefinition = {
  id: OUTPOST_NAVIGATION_LAYOUT_ID,
  backend: OUTPOST_NAVIGATION_BACKEND_ID,
  source: { type: "navigation.graph", id: navigationGraph.id },
  areas: [
    { id: "lane", cost: 1 },
    { id: "objective", cost: 1.15 }
  ],
  tags: ["outpost", "frontier"]
};

const aiEntries: DataPackEntry[] = [
  entry("ai.sensor", "ai.outpost.sensor.threat", {
    id: "ai.outpost.sensor.threat",
    sampler: "outpost.nearest-player",
    intervalMs: 120,
    tags: ["outpost", "combat"]
  }),
  entry("ai.task", "ai.outpost.task.assault", {
    id: "ai.outpost.task.assault",
    executor: "outpost.assault-target",
    interruptPolicy: "safe-point",
    timeoutMs: 30_000,
    tags: ["outpost", "combat"]
  }),
  entry("ai.goal", "ai.outpost.goal.assault", {
    id: "ai.outpost.goal.assault",
    task: { type: "ai.task", id: "ai.outpost.task.assault" },
    considerations: [{ input: "outpost.target-available", curve: { type: "linear" } }],
    minScore: 0.1,
    commitmentMs: 700,
    switchThreshold: 0.12,
    cooldownMs: 180,
    tags: ["outpost", "combat"]
  }),
  entry("ai.agent", "ai.outpost.agent.raider", {
    id: "ai.outpost.agent.raider",
    sensors: [{ type: "ai.sensor", id: "ai.outpost.sensor.threat" }],
    goals: [{ type: "ai.goal", id: "ai.outpost.goal.assault" }],
    decisionIntervalMs: 160,
    memoryLimit: 8,
    blackboardLimit: 4,
    schedulerClass: "frontline",
    tags: ["outpost", "raider"]
  }),
  entry("ai.agent", "ai.outpost.agent.overseer", {
    id: "ai.outpost.agent.overseer",
    sensors: [{ type: "ai.sensor", id: "ai.outpost.sensor.threat" }],
    goals: [{ type: "ai.goal", id: "ai.outpost.goal.assault" }],
    decisionIntervalMs: 120,
    memoryLimit: 12,
    blackboardLimit: 4,
    schedulerClass: "boss",
    tags: ["outpost", "overseer"]
  })
];

const animatorEntries = createAnimatorEntries();

export const outpostGeneratedAudioAssets: AssetDefinition[] = [
  downloadedMusicAsset(OUTPOST_AUDIO_ASSET_IDS.ambience, "/assets/outpost/audio/magic-space.ogg"),
  generatedAudioAsset(OUTPOST_AUDIO_ASSET_IDS.rifle, 620, 160, "combat", false),
  generatedAudioAsset(OUTPOST_AUDIO_ASSET_IDS.enemyTelegraph, 240, 420, "combat", false),
  generatedAudioAsset(OUTPOST_AUDIO_ASSET_IDS.hit, 90, 220, "combat", false)
];

export const outpostFoundationDataEntries: DataPackEntry[] = [
  entry("combat.relationship-policy", relationshipPolicy.id, relationshipPolicy),
  entry("combat.projectile", projectile.id, projectile),
  ...deliveries.map((definition) => entry("combat.delivery", definition.id, definition)),
  ...abilityDeliveries.map((definition) =>
    entry("combat.ability-delivery", definition.id, definition)
  ),
  entry("navigation.agent-profile", navigationProfile.id, navigationProfile),
  entry("navigation.graph", navigationGraph.id, navigationGraph),
  entry("navigation.layout", navigationLayout.id, navigationLayout),
  ...aiEntries,
  ...animatorEntries
];

export function outpostSpriteAnimations(assetId: string): AssetAnimationManifest[] {
  const role = OUTPOST_ANIMATED_ASSETS[assetId as keyof typeof OUTPOST_ANIMATED_ASSETS];
  if (role === undefined) {
    return [];
  }
  return [
    animation(`outpost.${role}.idle`, -1),
    animation(`outpost.${role}.run`, -1),
    animation(`outpost.${role}.attack`, 0),
    animation(`outpost.${role}.hit`, 0),
    animation(`outpost.${role}.dead`, 0)
  ];
}

export function outpostAnimatorBindingIdForRenderKey(renderKey: string): string | undefined {
  switch (renderKey) {
    case "render.outpost.player":
      return "animator.outpost.binding.player";
    case "render.outpost.raider":
      return "animator.outpost.binding.raider";
    case "render.outpost.overseer":
      return "animator.outpost.binding.overseer";
    default:
      return undefined;
  }
}

function createAnimatorEntries(): DataPackEntry[] {
  const graphId = "animator.outpost.actor.graph";
  const graph: AnimatorGraphDefinition = {
    id: graphId,
    parameters: [
      { id: "speed", type: "number", default: 0 },
      { id: "dead", type: "boolean", default: false }
    ],
    layers: [
      {
        id: "base",
        initialState: "idle",
        states: [
          { id: "idle", clip: "idle", loop: true },
          { id: "run", clip: "run", loop: true, speedParameter: "speed" },
          { id: "dead", clip: "dead", loop: true }
        ],
        transitions: [
          {
            from: "idle",
            to: "dead",
            priority: 100,
            conditions: [{ parameter: "dead", operator: "==", value: true }]
          },
          {
            from: "run",
            to: "dead",
            priority: 100,
            conditions: [{ parameter: "dead", operator: "==", value: true }]
          },
          {
            from: "idle",
            to: "run",
            conditions: [{ parameter: "speed", operator: ">", value: 0.05 }]
          },
          {
            from: "run",
            to: "idle",
            conditions: [{ parameter: "speed", operator: "<=", value: 0.05 }]
          }
        ]
      }
    ]
  };
  const entries: DataPackEntry[] = [entry("animator.graph", graph.id, graph)];
  for (const [assetId, role] of Object.entries(OUTPOST_ANIMATED_ASSETS)) {
    const clipDefinitions = [
      clip(role, "idle", assetId, 1_000, true),
      clip(role, "run", assetId, 520, true),
      clip(role, "attack", assetId, 900, false),
      clip(role, "hit", assetId, 180, false),
      clip(role, "dead", assetId, 1_000, true)
    ];
    entries.push(
      ...clipDefinitions.map((definition) => entry("animation.clip", definition.id, definition))
    );
    const bindingDefinition: AnimatorBindingDefinition = {
      id: `animator.outpost.binding.${role}`,
      graph: { type: "animator.graph", id: graphId },
      clips: Object.fromEntries(
        clipDefinitions.map((definition) => [
          definition.id.split(".").at(-1)!,
          { type: "animation.clip" as const, id: definition.id }
        ])
      ),
      fallbackClip: "idle",
      phaseMappings: [
        {
          phase: "preparing",
          layer: "base",
          clip: "attack"
        },
        {
          phase: "committed",
          layer: "base",
          clip: "attack"
        },
        {
          phase: "active",
          layer: "base",
          clip: "attack"
        },
        {
          phase: "recovering",
          layer: "base",
          clip: "attack"
        }
      ]
    };
    entries.push(entry("animator.binding", bindingDefinition.id, bindingDefinition));
  }
  return entries;
}

function clip(
  role: string,
  name: string,
  assetId: string,
  durationMs: number,
  loop: boolean
): AnimationClipDefinition {
  return {
    id: `animation.outpost.${role}.${name}`,
    asset: { assetId, type: "spritesheet" },
    backendClip: `outpost.${role}.${name}`,
    durationMs,
    loop
  };
}

function animation(id: string, repeat: number): AssetAnimationManifest {
  return { id, frames: [0], frameRate: 1, repeat };
}

function binding(
  id: string,
  abilityId: string,
  deliveryId: string
): CombatAbilityDeliveryDefinition {
  return {
    id,
    ability: { type: "gas.ability", id: abilityId },
    delivery: { type: "combat.delivery", id: deliveryId },
    phase: "committed",
    tags: ["outpost"]
  };
}

function node(id: string, x: number, y: number, area: string) {
  return { id, point: { x, y }, area, clearance: 52, heightClearance: 64 };
}

function edge(id: string, from: string, to: string, area = "lane") {
  return {
    id: `edge.outpost.${id}`,
    from,
    to,
    area,
    width: 72,
    heightClearance: 64,
    bidirectional: true
  };
}

function barricadeBlocker(group: string, edgeId: string): OutpostNavigationBarricadeBlocker {
  const objectIds = outpostArenaDefinition.staticObjects
    .filter((object) => object.id.startsWith(`barricade.${group}.`))
    .map((object) => object.id);
  if (objectIds.length === 0) {
    throw new Error(`Outpost navigation barricade group has no arena objects: ${group}`);
  }
  return {
    id: `navigation.blocker.outpost.${group}`,
    objectIds,
    edgeId
  };
}

function entry<TData>(type: string, id: string, data: TData): DataPackEntry<TData> {
  return { type, id, data };
}

function generatedAudioAsset(
  id: string,
  frequency: number,
  durationMs: number,
  group: "match" | "combat",
  loop: boolean
): AssetDefinition {
  return {
    id,
    type: "audio",
    source: { type: "url", url: createToneWaveDataUrl(frequency, durationMs, loop) },
    group,
    preload: true,
    tags: ["outpost", "audio", group],
    audio: { stream: false, instances: loop ? 2 : 16 }
  };
}

function downloadedMusicAsset(id: string, runtimeUrl: string): AssetDefinition {
  return {
    id,
    type: "audio",
    source: { type: "url", url: runtimeUrl },
    group: "match",
    preload: true,
    tags: ["outpost", "audio", "match", "music", "cc0"],
    audio: { stream: false, instances: 2 },
    metadata: {
      title: "Magic Space",
      author: "CodeManu",
      source: "https://opengameart.org/content/magic-space",
      license: "CC0-1.0",
      sha256: "c87cf01d5ab620d7f4e1898bd125265006d92fe8d60a695f6b3cd21c2d6e1be9"
    }
  };
}

function createToneWaveDataUrl(frequency: number, durationMs: number, loop: boolean): string {
  const sampleRate = 8_000;
  const frameCount = Math.max(1, Math.round((durationMs / 1_000) * sampleRate));
  const bytes = new Uint8Array(44 + frameCount * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + frameCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, frameCount * 2, true);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const progress = frame / frameCount;
    const envelope = loop ? 0.24 : Math.max(0, Math.min(1, progress * 18, (1 - progress) * 7));
    const signal =
      Math.sin(time * frequency * Math.PI * 2) * 0.66 +
      Math.sin(time * frequency * 2.03 * Math.PI * 2) * 0.18;
    view.setInt16(44 + frame * 2, Math.round(signal * envelope * 32_767), true);
  }
  return `data:audio/wav;base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return globalThis.btoa(binary);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
