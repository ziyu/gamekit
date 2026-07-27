import type { AiUtilityCurve } from "./utility";

export function evaluateAiUtilityCurve(curve: AiUtilityCurve, raw: number): number {
  if (!Number.isFinite(raw)) {
    return 0;
  }
  switch (curve.type) {
    case "linear":
      return normalize(raw, curve.min ?? 0, curve.max ?? 1);
    case "inverse":
      return 1 - normalize(raw, curve.min ?? 0, curve.max ?? 1);
    case "step":
      return clampAiUtilityValue(raw >= curve.threshold ? (curve.above ?? 1) : (curve.below ?? 0));
    case "power":
      return Math.pow(normalize(raw, curve.min ?? 0, curve.max ?? 1), curve.exponent);
    case "points":
      return evaluatePointsCurve(curve.points, raw);
  }
}

function evaluatePointsCurve(points: Array<{ x: number; y: number }>, raw: number): number {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (raw <= first.x) {
    return clampAiUtilityValue(first.y);
  }
  if (raw >= last.x) {
    return clampAiUtilityValue(last.y);
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left !== undefined && right !== undefined && raw >= left.x && raw <= right.x) {
      const amount = (raw - left.x) / (right.x - left.x);
      return clampAiUtilityValue(left.y + (right.y - left.y) * amount);
    }
  }
  return 0;
}

function normalize(value: number, min: number, max: number): number {
  return max === min ? (value >= max ? 1 : 0) : clampAiUtilityValue((value - min) / (max - min));
}

export function clampAiUtilityValue(value: number): number {
  return Math.max(0, Math.min(1, value));
}
