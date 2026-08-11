import type { DataPack, DataRef } from "@gamekit/data";
import {
  ARENA_BOT_ARCHETYPE_TYPE,
  ARENA_COURSE_TYPE,
  ARENA_HAZARD_TYPE,
  ARENA_ITEM_TYPE,
  ARENA_MATCH_RULE_TYPE,
  ARENA_MOTOR_PROFILE_TYPE,
  ARENA_SPAWN_SET_TYPE,
  ARENA_STAGE_TYPE,
  type ArenaBotArchetypeDefinition,
  type ArenaCourseDefinition,
  type ArenaDynamicPropPlacementDefinition,
  type ArenaGameplayVolumeDefinition,
  type ArenaHazardDefinition,
  type ArenaHazardPlacementDefinition,
  type ArenaItemDefinition,
  type ArenaMatchRuleDefinition,
  type ArenaMotorProfileDefinition,
  type ArenaSpawnPointDefinition,
  type ArenaSpawnSetDefinition,
  type ArenaStaticPlacementDefinition,
  type ArenaStageDefinition
} from "./types";

export const ARENA_CONTENT_PACK_ID = "knockout-arena.base";
export const ARENA_CONTENT_VERSION = "1.0.0";
export const ARENA_DEFAULT_MATCH_RULE_ID = "match.knockout.standard";

const items: ArenaItemDefinition[] = [
  item("item.foam-ball", "throwable", {
    physics: physicsItem({ type: "sphere", radius: 0.48 }, 0.75, 0.5, 0.72, 22, 240, 4),
    carry: carryItem(1, 1, "drop"),
    action: actionItem("throw-contact", 8, 30, 240, 24, 12, 5, 0),
    respawn: { mode: "timed", ticks: 240 },
    presentationId: "presentation.foam-ball",
    networkStrategy: "predicted-entity"
  }),
  item("item.energy-block", "impact", {
    physics: physicsItem(
      { type: "box", width: 0.85, height: 0.7, depth: 0.85 },
      4.5,
      0.7,
      0.22,
      14,
      300,
      2
    ),
    carry: carryItem(0.72, 0.86, "drop"),
    action: actionItem("throw-contact", 24, 60, 300, 45, 8, 11, 0),
    respawn: { mode: "timed", ticks: 300 },
    presentationId: "presentation.energy-block",
    networkStrategy: "predicted-entity"
  }),
  item("item.blast-orb", "area", {
    physics: physicsItem({ type: "sphere", radius: 0.65 }, 1.6, 0.45, 0.35, 18, 180, 1),
    carry: carryItem(0.88, 0.95, "spend"),
    action: actionItem("throw-area", 18, 45, 90, 60, 10, 8, 3.8),
    respawn: { mode: "timed", ticks: 360 },
    presentationId: "presentation.blast-orb",
    networkStrategy: "predicted-entity"
  }),
  item("item.foam-hammer", "melee", {
    physics: physicsItem(
      { type: "box", width: 0.55, height: 1.6, depth: 0.45 },
      2.2,
      0.65,
      0.18,
      10,
      300,
      0
    ),
    carry: carryItem(0.82, 0.92, "drop"),
    action: actionItem("melee", 14, 0, 12, 36, 0, 8, 1.8),
    respawn: { mode: "timed", ticks: 300 },
    presentationId: "presentation.foam-hammer",
    networkStrategy: "authority-only"
  })
];

export const ARENA_STANDARD_MOTOR_PROFILE: ArenaMotorProfileDefinition = {
  id: "motor.standard",
  maxGroundSpeed: 6.4,
  groundAcceleration: 28,
  groundBraking: 34,
  airAcceleration: 9,
  jumpSpeed: 7.2,
  diveSpeed: 9.4,
  coyoteTicks: 6,
  jumpBufferTicks: 7
};

const motorProfiles: ArenaMotorProfileDefinition[] = [ARENA_STANDARD_MOTOR_PROFILE];

const botArchetypes: ArenaBotArchetypeDefinition[] = [
  bot("bot.sprinter", 7, 0.12, 0.35, 0.68, ["item.foam-ball"]),
  bot("bot.brawler", 10, 0.08, 0.88, 0.72, ["item.foam-hammer", "item.energy-block"]),
  bot("bot.opportunist", 13, 0.18, 0.62, 0.42, ["item.blast-orb", "item.foam-ball"])
];

const hazards: ArenaHazardDefinition[] = [
  hazard("hazard.circuit.sweeper", "rotating-sweeper", "kinematic", 240, 0, 240),
  hazard("hazard.circuit.platform", "moving-platform", "kinematic", 300, 45, 300),
  hazard("hazard.circuit.piston", "piston", "kinematic", 180, 30, 72),
  hazard("hazard.scrap.conveyor", "conveyor", "kinematic", 300, 0, 300),
  hazard("hazard.scrap.wind", "wind-zone", "sensor", 210, 35, 90),
  hazard("hazard.scrap.bounce", "bounce-pad", "sensor", 120, 0, 120),
  hazard("hazard.crown.floor", "crumble-floor", "kinematic", 360, 60, 240),
  hazard("hazard.crown.zone", "shrinking-zone", "sensor", 900, 0, 900)
];

const spawnSets: ArenaSpawnSetDefinition[] = [
  spawnSet("spawn.circuit", [
    ...participantPoints(8, 5.4),
    {
      id: "item.0",
      kind: "item",
      position: { x: 0, y: 1.2, z: 2.2 },
      definition: ref(ARENA_ITEM_TYPE, "item.foam-ball")
    }
  ]),
  spawnSet("spawn.scrap", [
    ...participantPoints(6, 6, 36),
    ...itemPoints(
      ["item.foam-ball", "item.energy-block", "item.blast-orb", "item.foam-hammer"],
      36,
      -0.5
    )
  ]),
  spawnSet("spawn.crown", [
    ...participantPoints(3, 5, 72),
    ...itemPoints(["item.foam-ball", "item.foam-hammer"], 72, -1)
  ])
];

const courses: ArenaCourseDefinition[] = [
  course("course.circuit-forge", "spawn.circuit", {
    bounds: { min: { x: -12, y: -6, z: -15 }, max: { x: 12, y: 8, z: 8 } },
    staticLayout: [
      staticBox("circuit.floor", "floor", 0, -0.5, -2.5, 22, 1, 25, "course", "walkable"),
      staticBox("circuit.ramp-left", "ramp", -7.8, 0.45, -7.2, 4.5, 0.9, 4.8, "course", "walkable"),
      staticBox("circuit.ramp-right", "ramp", 7.8, 0.45, -7.2, 4.5, 0.9, 4.8, "course", "walkable"),
      staticBox(
        "circuit.finish-deck",
        "finish-deck",
        0,
        0.7,
        -12.4,
        8,
        1.4,
        2.4,
        "course",
        "walkable"
      )
    ],
    hazards: [
      hazardPlacement(
        "circuit.sweeper",
        "hazard.circuit.sweeper",
        0,
        1,
        -2,
        13,
        0.55,
        0.55,
        "y",
        0,
        9
      ),
      hazardPlacement(
        "circuit.moving-bridge",
        "hazard.circuit.platform",
        -5.8,
        1.2,
        -9,
        4.2,
        0.5,
        3.2,
        "y",
        2.3,
        0
      ),
      hazardPlacement(
        "circuit.piston-gate",
        "hazard.circuit.piston",
        0,
        1.3,
        -5.7,
        2.2,
        2.6,
        1.2,
        "x",
        7.2,
        12
      )
    ],
    props: [
      propSphere("circuit.prop.ball", 0, 1.1, 0, 0.85, 0.8, "presentation.prop-ball"),
      propBox(
        "circuit.prop.block-left",
        -3.2,
        1,
        -4,
        1.4,
        1.4,
        1.4,
        1.4,
        "presentation.prop-block"
      ),
      propBox("circuit.prop.block-right", 3.2, 1, -4, 1.4, 1.4, 1.4, 1.4, "presentation.prop-block")
    ],
    volumes: [
      volume("circuit.kill", "kill", 0, -4.5, -3, 28, 3, 34),
      volume("circuit.checkpoint.1", "checkpoint", 0, 1.2, 0, 20, 3, 1.5, 1),
      volume("circuit.checkpoint.2", "checkpoint", 0, 1.2, -7.5, 20, 4, 1.5, 2),
      volume("circuit.finish", "finish", 0, 1.8, -12.4, 8, 3, 1.2, 3)
    ],
    navigation: navigationProfile(),
    presentation: { themeId: "circuit-forge", accent: "#44e6ff", skyline: "orbital-forge" }
  }),
  course("course.scrap-yard", "spawn.scrap", {
    bounds: { min: { x: 23, y: -6, z: -14 }, max: { x: 49, y: 9, z: 13 } },
    staticLayout: [
      staticBox("scrap.floor", "floor", 36, -0.5, 0, 23, 1, 23, "mud", "slow"),
      staticBox("scrap.ring-north", "platform", 36, 0.35, -7.8, 12, 0.7, 3.5, "course", "walkable"),
      staticBox("scrap.ring-south", "platform", 36, 0.35, 7.8, 12, 0.7, 3.5, "course", "walkable"),
      staticBox("scrap.ring-west", "platform", 28.2, 0.35, 0, 3.5, 0.7, 12, "course", "walkable"),
      staticBox("scrap.ring-east", "platform", 43.8, 0.35, 0, 3.5, 0.7, 12, "course", "walkable")
    ],
    hazards: [
      hazardPlacement(
        "scrap.outer-conveyor",
        "hazard.scrap.conveyor",
        36,
        0.15,
        8.4,
        15,
        0.3,
        2.8,
        "x",
        0,
        5.5
      ),
      hazardPlacement(
        "scrap.fan-tunnel",
        "hazard.scrap.wind",
        28.5,
        1.8,
        -1,
        4,
        3.6,
        8,
        "x",
        0,
        10
      ),
      hazardPlacement(
        "scrap.launch-pad",
        "hazard.scrap.bounce",
        42.5,
        0.2,
        -4.8,
        3.2,
        0.4,
        3.2,
        "y",
        0,
        13
      )
    ],
    props: [
      propBox("scrap.prop.heavy-a", 33, 1.1, 1, 1.7, 1.7, 1.7, 4.5, "presentation.scrap-crate"),
      propBox("scrap.prop.heavy-b", 39, 1.1, 1, 1.7, 1.7, 1.7, 4.5, "presentation.scrap-crate"),
      propSphere("scrap.prop.roller-a", 31, 1, -5.5, 0.95, 2.4, "presentation.scrap-roller"),
      propSphere("scrap.prop.roller-b", 41, 1, 5.5, 0.95, 2.4, "presentation.scrap-roller")
    ],
    volumes: [
      volume("scrap.kill", "kill", 36, -4.5, 0, 32, 3, 32),
      volume("scrap.objective", "objective", 36, 1.4, 0, 8, 3, 8),
      volume("scrap.safe-zone", "safe-zone", 36, 1.4, 0, 20, 3, 20)
    ],
    navigation: navigationProfile(),
    presentation: { themeId: "scrap-yard", accent: "#ffcf4b", skyline: "salvage-bay" }
  }),
  course("course.crown-collapse", "spawn.crown", {
    bounds: { min: { x: 59, y: -7, z: -13 }, max: { x: 85, y: 9, z: 13 } },
    staticLayout: [
      staticBox("crown.center", "platform", 72, 0, 0, 7, 0.8, 7, "course", "walkable"),
      staticBox("crown.north", "platform", 72, 0, -6.2, 9, 0.8, 4.2, "ice", "slick"),
      staticBox("crown.south", "platform", 72, 0, 6.2, 9, 0.8, 4.2, "ice", "slick"),
      staticBox("crown.west", "platform", 65.8, 0, 0, 4.2, 0.8, 9, "ice", "slick"),
      staticBox("crown.east", "platform", 78.2, 0, 0, 4.2, 0.8, 9, "ice", "slick")
    ],
    hazards: [
      hazardPlacement(
        "crown.collapse-band",
        "hazard.crown.floor",
        72,
        0.35,
        0,
        19,
        0.7,
        3.2,
        "z",
        8,
        0
      ),
      hazardPlacement("crown.shrinking-zone", "hazard.crown.zone", 72, 1.4, 0, 21, 3, 21, "x", 7, 8)
    ],
    props: [propSphere("crown.prop.core", 72, 1.1, 0, 1, 3.2, "presentation.crown-core")],
    volumes: [
      volume("crown.kill", "kill", 72, -5, 0, 32, 4, 32),
      volume("crown.safe-zone", "safe-zone", 72, 1.3, 0, 20, 3, 20)
    ],
    navigation: navigationProfile(),
    presentation: { themeId: "crown-collapse", accent: "#ff5b55", skyline: "champion-vault" }
  })
];

const stages: ArenaStageDefinition[] = [
  stage("stage.circuit-forge", "qualifier", "course.circuit-forge", 6, 5_400, ["item.foam-ball"]),
  stage(
    "stage.scrap-yard",
    "brawl",
    "course.scrap-yard",
    3,
    5_400,
    items.map(({ id }) => id)
  ),
  stage("stage.crown-collapse", "final", "course.crown-collapse", 1, 4_500, [
    "item.foam-ball",
    "item.foam-hammer"
  ])
];

const matchRules: ArenaMatchRuleDefinition[] = [
  {
    id: ARENA_DEFAULT_MATCH_RULE_ID,
    participantCount: 8,
    stages: stages.map(({ id }) => ref(ARENA_STAGE_TYPE, id))
  }
];

export const arenaContentPack: DataPack = {
  id: ARENA_CONTENT_PACK_ID,
  version: ARENA_CONTENT_VERSION,
  namespace: "knockout-arena",
  entries: [
    ...motorProfiles.map((data) => entry(ARENA_MOTOR_PROFILE_TYPE, data)),
    ...items.map((data) => entry(ARENA_ITEM_TYPE, data)),
    ...botArchetypes.map((data) => entry(ARENA_BOT_ARCHETYPE_TYPE, data)),
    ...hazards.map((data) => entry(ARENA_HAZARD_TYPE, data)),
    ...spawnSets.map((data) => entry(ARENA_SPAWN_SET_TYPE, data)),
    ...courses.map((data) => entry(ARENA_COURSE_TYPE, data)),
    ...stages.map((data) => entry(ARENA_STAGE_TYPE, data)),
    ...matchRules.map((data) => entry(ARENA_MATCH_RULE_TYPE, data))
  ]
};

function item(
  id: string,
  kind: ArenaItemDefinition["kind"],
  definition: Omit<ArenaItemDefinition, "id" | "kind">
): ArenaItemDefinition {
  return { id, kind, ...definition };
}

function physicsItem(
  shape: ArenaItemDefinition["physics"]["shape"],
  mass: number,
  friction: number,
  restitution: number,
  maxLinearSpeed: number,
  lifetimeTicks: number,
  maxBounces: number
): ArenaItemDefinition["physics"] {
  return {
    shape,
    mass,
    friction,
    restitution,
    continuousCollisionDetection: true,
    maxLinearSpeed,
    lifetimeTicks,
    maxBounces
  };
}

function carryItem(
  speedMultiplier: number,
  jumpMultiplier: number,
  dropPolicy: ArenaItemDefinition["carry"]["dropPolicy"]
): ArenaItemDefinition["carry"] {
  return { socket: "hand.primary", speedMultiplier, jumpMultiplier, dropPolicy };
}

function actionItem(
  mode: ArenaItemDefinition["action"]["mode"],
  windupTicks: number,
  maxChargeTicks: number,
  activeTicks: number,
  cooldownTicks: number,
  launchSpeed: number,
  baseImpulse: number,
  areaRadius: number
): ArenaItemDefinition["action"] {
  return {
    mode,
    windupTicks,
    maxChargeTicks,
    activeTicks,
    cooldownTicks,
    launchSpeed,
    baseImpulse,
    areaRadius
  };
}

function bot(
  id: string,
  reactionTicks: number,
  aimErrorRadians: number,
  aggression: number,
  riskTolerance: number,
  preferredItems: string[]
): ArenaBotArchetypeDefinition {
  return {
    id,
    motor: ref(ARENA_MOTOR_PROFILE_TYPE, "motor.standard"),
    reactionTicks,
    aimErrorRadians,
    aggression,
    riskTolerance,
    preferredItems: preferredItems.map((itemId) => ref(ARENA_ITEM_TYPE, itemId))
  };
}

function hazard(
  id: string,
  kind: ArenaHazardDefinition["kind"],
  bodyKind: ArenaHazardDefinition["bodyKind"],
  periodTicks: number,
  phaseTicks: number,
  activeTicks: number
): ArenaHazardDefinition {
  return { id, kind, bodyKind, schedule: { periodTicks, phaseTicks, activeTicks } };
}

function spawnSet(id: string, points: ArenaSpawnPointDefinition[]): ArenaSpawnSetDefinition {
  return { id, points };
}

function participantPoints(count: number, z: number, centerX = 0): ArenaSpawnPointDefinition[] {
  const halfSpan = Math.min(4.8, ((count - 1) * 1.7) / 2);
  const orderedOffsets = Array.from(
    { length: count },
    (_, index) => -halfSpan + (index / Math.max(1, count - 1)) * halfSpan * 2
  );
  if (orderedOffsets.length >= 2) {
    const left = orderedOffsets.shift()!;
    const right = orderedOffsets.pop()!;
    orderedOffsets.unshift(left, right);
  }
  return orderedOffsets.map((offset, index) => ({
    id: `participant.${index}`,
    kind: "participant" as const,
    position: { x: centerX + offset, y: 1.3, z }
  }));
}

function itemPoints(ids: string[], centerX = 0, z = -1.5): ArenaSpawnPointDefinition[] {
  return ids.map((id, index) => ({
    id: `item.${index}`,
    kind: "item",
    position: { x: centerX + (index - (ids.length - 1) / 2) * 2.4, y: 1.2, z },
    definition: ref(ARENA_ITEM_TYPE, id)
  }));
}

function course(
  id: string,
  spawnSetId: string,
  definition: Omit<ArenaCourseDefinition, "id" | "definitionVersion" | "spawnSet">
): ArenaCourseDefinition {
  return {
    id,
    definitionVersion: `${id}.v1`,
    spawnSet: ref(ARENA_SPAWN_SET_TYPE, spawnSetId),
    ...definition
  };
}

function staticBox(
  id: string,
  role: ArenaStaticPlacementDefinition["role"],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: ArenaStaticPlacementDefinition["material"],
  navigationArea?: ArenaStaticPlacementDefinition["navigationArea"]
): ArenaStaticPlacementDefinition {
  return {
    id,
    role,
    position: { x, y, z },
    size: { width, height, depth },
    material,
    ...(navigationArea === undefined ? {} : { navigationArea })
  };
}

function hazardPlacement(
  id: string,
  definitionId: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  axis: ArenaHazardPlacementDefinition["axis"],
  travel: number,
  strength: number
): ArenaHazardPlacementDefinition {
  return {
    id,
    definition: ref(ARENA_HAZARD_TYPE, definitionId),
    position: { x, y, z },
    size: { width, height, depth },
    axis,
    travel,
    strength
  };
}

function propSphere(
  id: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  mass: number,
  presentationId: string
): ArenaDynamicPropPlacementDefinition {
  return {
    id,
    shape: { type: "sphere", radius },
    position: { x, y, z },
    mass,
    material: "prop",
    presentationId
  };
}

function propBox(
  id: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  mass: number,
  presentationId: string
): ArenaDynamicPropPlacementDefinition {
  return {
    id,
    shape: { type: "box", width, height, depth },
    position: { x, y, z },
    mass,
    material: "prop",
    presentationId
  };
}

function volume(
  id: string,
  kind: ArenaGameplayVolumeDefinition["kind"],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  routeOrder?: number
): ArenaGameplayVolumeDefinition {
  return {
    id,
    kind,
    position: { x, y, z },
    size: { width, height, depth },
    ...(routeOrder === undefined ? {} : { routeOrder })
  };
}

function navigationProfile(): ArenaCourseDefinition["navigation"] {
  return { agentRadius: 0.52, agentHeight: 1.89, maxClimb: 0.45, maxSlopeDegrees: 46 };
}

function stage(
  id: string,
  kind: ArenaStageDefinition["kind"],
  courseId: string,
  qualificationCount: number,
  durationTicks: number,
  itemIds: string[]
): ArenaStageDefinition {
  return {
    id,
    kind,
    course: ref(ARENA_COURSE_TYPE, courseId),
    qualificationCount,
    durationTicks,
    itemPool: itemIds.map((itemId) => ref(ARENA_ITEM_TYPE, itemId)),
    botArchetypes: botArchetypes.map(({ id: botId }) => ref(ARENA_BOT_ARCHETYPE_TYPE, botId))
  };
}

function entry<T extends { id: string }>(type: string, data: T) {
  return { type, id: data.id, data };
}

function ref<TType extends string>(type: TType, id: string): DataRef<TType> {
  return { type, id };
}
