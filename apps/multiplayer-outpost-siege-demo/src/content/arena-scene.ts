import {
  OUTPOST_RENDER_OBJECT_TYPE,
  type OutpostArenaDefinition,
  type OutpostArenaStaticObjectDefinition
} from "../domain";

export const OUTPOST_ARENA = Object.freeze({ width: 1800, height: 1000 });
export const OUTPOST_ARENA_DEFINITION_ID = "arena.outpost.siege";
export const OUTPOST_ARENA_SOLID_COLLIDER_ID = "collider.outpost.arena.solid";

export const outpostArenaDefinition = {
  id: OUTPOST_ARENA_DEFINITION_ID,
  ...OUTPOST_ARENA,
  floor: { type: OUTPOST_RENDER_OBJECT_TYPE, id: "render.outpost.arena" },
  staticObjects: [
    // Fortified perimeter segments. The four open lanes are intentional spawn entrances.
    object("wall.north-west.outer", "wall", 315, 104, 300, 92),
    object("wall.north-west.inner", "wall", 615, 104, 300, 92),
    object("wall.north-east.inner", "wall", 1185, 104, 300, 92),
    object("wall.north-east.outer", "wall", 1485, 104, 300, 92),
    object("wall.south-west.outer", "wall", 315, 896, 300, 92),
    object("wall.south-west.inner", "wall", 615, 896, 300, 92),
    object("wall.south-east.inner", "wall", 1185, 896, 300, 92),
    object("wall.south-east.outer", "wall", 1485, 896, 300, 92),
    object("wall.west-north", "wall", 150, 260, 280, 86, Math.PI / 2),
    object("wall.west-south", "wall", 150, 740, 280, 86, Math.PI / 2),
    object("wall.east-north", "wall", 1650, 260, 280, 86, Math.PI / 2),
    object("wall.east-south", "wall", 1650, 740, 280, 86, Math.PI / 2),

    // Each L-shaped barricade is composed from two simple collision-friendly segments.
    object("barricade.north-west.horizontal", "barricade", 640, 282, 160, 60),
    object("barricade.north-west.vertical", "barricade", 716, 336, 108, 40, Math.PI / 2),
    object("barricade.north-east.horizontal", "barricade", 1160, 282, 160, 60),
    object("barricade.north-east.vertical", "barricade", 1084, 336, 108, 40, Math.PI / 2),
    object("barricade.south-west.horizontal", "barricade", 640, 718, 160, 60),
    object("barricade.south-west.vertical", "barricade", 716, 664, 108, 40, Math.PI / 2),
    object("barricade.south-east.horizontal", "barricade", 1160, 718, 160, 60),
    object("barricade.south-east.vertical", "barricade", 1084, 664, 108, 40, Math.PI / 2),

    // Objective ring and mid-lane cover use the same reusable armored crate.
    object("cover.ring.north-west", "cover", 805, 410, 96, 48, Math.PI / 4),
    object("cover.ring.north-east", "cover", 995, 410, 96, 48, -Math.PI / 4),
    object("cover.ring.south-west", "cover", 805, 590, 96, 48, -Math.PI / 4),
    object("cover.ring.south-east", "cover", 995, 590, 96, 48, Math.PI / 4),
    object("cover.west.upper", "cover", 566, 474, 96, 48, Math.PI / 2),
    object("cover.west.lower", "cover", 566, 548, 112, 56),
    object("cover.east.upper", "cover", 1234, 474, 96, 48, Math.PI / 2),
    object("cover.east.lower", "cover", 1234, 548, 112, 56),

    object("pylon.north-west", "pylon", 500, 286, 48, 66),
    object("pylon.north-east", "pylon", 1300, 286, 48, 66),
    object("pylon.south-west", "pylon", 500, 714, 48, 66),
    object("pylon.south-east", "pylon", 1300, 714, 48, 66)
  ]
} satisfies OutpostArenaDefinition;

function object(
  id: string,
  kind: "wall" | "barricade" | "cover" | "pylon",
  x: number,
  y: number,
  width: number,
  height: number,
  rotation?: number
): OutpostArenaStaticObjectDefinition {
  return {
    id,
    renderObject: { type: OUTPOST_RENDER_OBJECT_TYPE, id: `render.outpost.${kind}` },
    collider: { type: "physics.collider", id: OUTPOST_ARENA_SOLID_COLLIDER_ID },
    position: { x, y },
    size: { width, height },
    ...(rotation === undefined ? {} : { rotation }),
    depth: 8
  };
}
