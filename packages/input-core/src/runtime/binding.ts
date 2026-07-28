import type { InputActionEvent, InputBinding, NormalizedInputEvent } from "./types";
import { createInputInvalidValueError } from "./errors";

export function matchesInputBinding(binding: InputBinding, input: NormalizedInputEvent): boolean {
  if (binding.device !== input.device) {
    return false;
  }
  if (binding.phase && binding.phase !== input.phase) {
    return false;
  }
  if (binding.code && binding.code !== input.code) {
    return false;
  }
  if (binding.button && binding.button !== input.button) {
    return false;
  }
  for (const modifier of binding.modifiers ?? []) {
    if (input.modifiers?.[modifier] !== true) {
      return false;
    }
  }

  return true;
}

export function inputValue(input: NormalizedInputEvent): number {
  if (typeof input.value === "number") {
    if (!Number.isFinite(input.value)) {
      throw createInputInvalidValueError(input.value, input.id);
    }
    return input.value;
  }
  if (typeof input.wheelDelta === "number") {
    return input.wheelDelta;
  }
  if (typeof input.dx === "number" || typeof input.dy === "number") {
    return Math.hypot(input.dx ?? 0, input.dy ?? 0);
  }
  if (input.phase === "released" || input.phase === "cancelled") {
    return 0;
  }
  return 1;
}

export function createInputActionEventId(input: NormalizedInputEvent, actionId: string): string {
  return `${input.id}:${actionId}`;
}

export function sortActionEvents(events: InputActionEvent[]): InputActionEvent[] {
  return events.sort((a, b) => a.actionId.localeCompare(b.actionId));
}
