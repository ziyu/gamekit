import type { InputActionId, InputContext } from "./types";

export function isInputContextEnabled(context: InputContext): boolean {
  return context.enabled ?? true;
}

export function contextAcceptsAction(context: InputContext, actionId: InputActionId): boolean {
  return !context.actionIds || context.actionIds.includes(actionId);
}

export function sortInputContexts(contexts: InputContext[]): InputContext[] {
  return contexts.slice().sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    return a.id.localeCompare(b.id);
  });
}
