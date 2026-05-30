import { ABYSS_ROOM_BOUNDS } from "./constants";

export type Point = {
  x: number;
  y: number;
};

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(x: number, y: number): Point {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function clampToRoom(point: Point, radius: number): Point {
  return {
    x: clamp(
      point.x,
      ABYSS_ROOM_BOUNDS.x + radius,
      ABYSS_ROOM_BOUNDS.x + ABYSS_ROOM_BOUNDS.width - radius
    ),
    y: clamp(
      point.y,
      ABYSS_ROOM_BOUNDS.y + radius,
      ABYSS_ROOM_BOUNDS.y + ABYSS_ROOM_BOUNDS.height - radius
    )
  };
}

export function angleTo(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
