import { createAudioError } from "../contracts/errors";
import type { AudioParameterDefinition, AudioParameterValue } from "./parameter-definition";
import type { AudioValueRange } from "./source-definition";

export function finite(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) {
    throw createAudioError("audio.invalid_config", `Audio ${label} must be finite`, { value });
  }
  return resolved;
}

export function nonNegative(value: number | undefined, fallback: number, label: string): number {
  const resolved = finite(value, fallback, label);
  if (resolved < 0) {
    throw createAudioError("audio.invalid_config", `Audio ${label} must be non-negative`, {
      value
    });
  }
  return resolved;
}

export function positive(value: number | undefined, fallback: number, label: string): number {
  const resolved = finite(value, fallback, label);
  if (resolved <= 0) {
    throw createAudioError("audio.invalid_config", `Audio ${label} must be positive`, { value });
  }
  return resolved;
}

export function positiveInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = positive(value, fallback, label);
  if (!Number.isInteger(resolved)) {
    throw createAudioError("audio.invalid_config", `Audio ${label} must be an integer`, { value });
  }
  return resolved;
}

export function nonNegativeInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = nonNegative(value, fallback, label);
  if (!Number.isInteger(resolved)) {
    throw createAudioError("audio.invalid_config", `Audio ${label} must be an integer`, { value });
  }
  return resolved;
}

export function unitInterval(value: number | undefined, fallback: number, label: string): number {
  const resolved = finite(value, fallback, label);
  if (resolved < 0 || resolved > 1) {
    throw createAudioError("audio.invalid_config", `Audio ${label} must be between zero and one`, {
      value
    });
  }
  return resolved;
}

export function stereoPan(value: number | undefined, fallback = 0): number {
  const resolved = finite(value, fallback, "pan");
  if (resolved < -1 || resolved > 1) {
    throw createAudioError("audio.invalid_config", "Audio pan must be between minus one and one", {
      value
    });
  }
  return resolved;
}

export function validateRange(value: AudioValueRange | undefined, label: string): void {
  if (value === undefined || typeof value === "number") {
    positive(value, 1, label);
    return;
  }
  const min = positive(value.min, 1, `${label} min`);
  const max = positive(value.max, 1, `${label} max`);
  if (min > max) {
    throw createAudioError("audio.invalid_config", `Audio ${label} min cannot exceed max`, {
      min,
      max
    });
  }
}

export function sampleRange(
  value: AudioValueRange | undefined,
  fallback: number,
  random: () => number
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "number") {
    return value;
  }
  return value.min + Math.min(1, Math.max(0, random())) * (value.max - value.min);
}

export function validateParameterValue(
  definition: AudioParameterDefinition,
  value: AudioParameterValue
): AudioParameterValue {
  switch (definition.kind) {
    case "continuous":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return invalidParameter(definition.id, value);
      }
      return Math.min(definition.max, Math.max(definition.min, value));
    case "discrete":
      if (typeof value !== "string" || !definition.values.includes(value)) {
        return invalidParameter(definition.id, value);
      }
      return value;
    case "boolean":
      if (typeof value !== "boolean") {
        return invalidParameter(definition.id, value);
      }
      return value;
  }
}

function invalidParameter(id: string, value: AudioParameterValue): never {
  throw createAudioError("audio.invalid_config", `Audio parameter value is invalid: ${id}`, {
    parameterId: id,
    value
  });
}
