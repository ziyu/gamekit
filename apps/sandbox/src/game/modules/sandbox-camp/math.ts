import { Position } from "../../components";

export function moveToward(
  current: ReturnType<typeof Position.create>,
  target: ReturnType<typeof Position.create>,
  distance: number
): ReturnType<typeof Position.create> {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance || length === 0) {
    return { x: target.x, y: target.y };
  }
  return {
    x: current.x + (dx / length) * distance,
    y: current.y + (dy / length) * distance
  };
}

export function midpoint(
  from: ReturnType<typeof Position.create> | undefined,
  to: ReturnType<typeof Position.create> | undefined
): ReturnType<typeof Position.create> {
  return {
    x: ((from?.x ?? 0) + (to?.x ?? 0)) / 2,
    y: ((from?.y ?? 0) + (to?.y ?? 0)) / 2
  };
}

export function distanceBetween(
  current: ReturnType<typeof Position.create>,
  target: ReturnType<typeof Position.create>
): number {
  return Math.hypot(target.x - current.x, target.y - current.y);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
