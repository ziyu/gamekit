import {
  createInputActionEventId,
  inputValue,
  matchesInputBinding,
  sortActionEvents
} from "./binding";
import { contextAcceptsAction, isInputContextEnabled, sortInputContexts } from "./context";
import {
  createInputDuplicateActionError,
  createInputDuplicateContextError,
  createInputMissingActionError,
  createInputMissingContextError
} from "./errors";
import type {
  InputActionDefinition,
  InputActionEvent,
  InputActionId,
  InputActionListener,
  InputBinding,
  InputContext,
  InputContextId,
  InputRouter,
  NormalizedInputEvent
} from "./types";

export type CreateInputRouterOptions = {
  defaultContexts?: InputContext[];
};

export function createInputRouter(options: CreateInputRouterOptions = {}): InputRouter {
  const actions = new Map<InputActionId, InputActionDefinition>();
  const actionBindings = new Map<InputActionId, InputBinding[]>();
  const contexts = new Map<InputContextId, InputContext>();
  const listeners = new Set<InputActionListener>();
  const activeActions = new Map<string, InputActionEvent>();
  let heldSequence = 0;

  for (const context of options.defaultContexts ?? [DEFAULT_GLOBAL_CONTEXT]) {
    contexts.set(context.id, { ...context });
  }

  return {
    registerAction(definition) {
      if (actions.has(definition.id)) {
        throw createInputDuplicateActionError(definition.id);
      }

      actions.set(definition.id, { ...definition });
      actionBindings.set(definition.id, [...definition.defaultBindings]);
    },
    unregisterAction(actionId) {
      if (!actions.delete(actionId)) {
        throw createInputMissingActionError(actionId);
      }
      actionBindings.delete(actionId);
    },
    setActionBindings(actionId, bindings) {
      if (!actions.has(actionId)) {
        throw createInputMissingActionError(actionId);
      }
      actionBindings.set(actionId, [...bindings]);
    },
    addContext(context) {
      if (contexts.has(context.id)) {
        throw createInputDuplicateContextError(context.id);
      }
      contexts.set(context.id, { ...context });
    },
    removeContext(contextId) {
      if (!contexts.delete(contextId)) {
        throw createInputMissingContextError(contextId);
      }
    },
    enableContext(contextId) {
      updateContext(contexts, contextId, true);
    },
    disableContext(contextId) {
      updateContext(contexts, contextId, false);
    },
    activeContexts() {
      return sortInputContexts([...contexts.values()].filter(isInputContextEnabled));
    },
    handle(input) {
      const emitted: InputActionEvent[] = [];
      const emittedActionIds = new Set<InputActionId>();

      for (const context of sortInputContexts([...contexts.values()])) {
        if (!isInputContextEnabled(context) || !contextAcceptsInputScope(context, input)) {
          continue;
        }

        const contextEvents = sortActionEvents(
          [...actions.values()]
            .filter((action) => contextAcceptsAction(context, action.id))
            .filter((action) => actionAcceptsInputScope(action, input))
            .filter((action) => !emittedActionIds.has(action.id))
            .filter((action) =>
              (actionBindings.get(action.id) ?? []).some((binding) =>
                matchesInputBinding(binding, input)
              )
            )
            .map((action) => {
              const event: InputActionEvent = {
                id: createInputActionEventId(input, action.id),
                actionId: action.id,
                contextId: context.id,
                phase: input.phase,
                value: inputValue(input),
                input,
                timestamp: input.timestamp
              };

              if (input.source) {
                event.source = input.source;
              }

              return event;
            })
        );

        for (const event of contextEvents) {
          emitted.push(event);
          emittedActionIds.add(event.actionId);
          updateActiveAction(activeActions, event, actionBindings.get(event.actionId) ?? []);
          for (const listener of listeners) {
            listener(event);
          }
        }

        if (contextEvents.length > 0 && context.capture !== false) {
          break;
        }
      }

      clearReleasedInputs(activeActions, input);
      return emitted;
    },
    tick(frame) {
      const events: InputActionEvent[] = [];

      for (const active of activeActions.values()) {
        const input: NormalizedInputEvent = {
          ...active.input,
          id: `${active.input.id}:held:${++heldSequence}`,
          phase: "held",
          timestamp: frame.timestamp
        };
        const event: InputActionEvent = {
          ...active,
          id: createInputActionEventId(input, active.actionId),
          phase: "held",
          value: inputValue(input),
          input,
          timestamp: frame.timestamp
        };

        activeActions.set(activeActionKey(event), event);
        events.push(event);
        for (const listener of listeners) {
          listener(event);
        }
      }

      return events;
    },
    onAction(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

const DEFAULT_GLOBAL_CONTEXT: InputContext = {
  id: "global",
  priority: 0,
  capture: false
};

function contextAcceptsInputScope(context: InputContext, input: { scope?: string }): boolean {
  if (!context.scopes) {
    return true;
  }

  return input.scope !== undefined && context.scopes.includes(input.scope);
}

function actionAcceptsInputScope(
  action: InputActionDefinition,
  input: { scope?: string }
): boolean {
  if (!action.scopes) {
    return true;
  }

  return input.scope !== undefined && action.scopes.includes(input.scope);
}

function updateActiveAction(
  activeActions: Map<string, InputActionEvent>,
  event: InputActionEvent,
  bindings: InputBinding[]
): void {
  const key = activeActionKey(event);
  if (event.phase === "pressed" || event.phase === "held") {
    if (actionSupportsHeld(bindings, event.input)) {
      activeActions.set(key, event);
    }
    return;
  }

  if (event.phase === "released" || event.phase === "cancelled") {
    activeActions.delete(key);
  }
}

function actionSupportsHeld(bindings: InputBinding[], input: NormalizedInputEvent): boolean {
  return bindings.some((binding) =>
    matchesInputBinding(binding, {
      ...input,
      phase: "held"
    })
  );
}

function clearReleasedInputs(
  activeActions: Map<string, InputActionEvent>,
  input: { phase: string; device: string; code?: string; button?: string; pointerId?: string }
): void {
  if (input.phase !== "released" && input.phase !== "cancelled") {
    return;
  }

  const inputKey = inputIdentity(input);
  for (const [key, event] of activeActions) {
    if (inputIdentity(event.input) === inputKey) {
      activeActions.delete(key);
    }
  }
}

function activeActionKey(event: InputActionEvent): string {
  return `${event.contextId}:${event.actionId}:${inputIdentity(event.input)}`;
}

function inputIdentity(input: {
  device: string;
  code?: string;
  button?: string;
  pointerId?: string;
}): string {
  return `${input.device}:${input.code ?? ""}:${input.button ?? ""}:${input.pointerId ?? ""}`;
}

function updateContext(
  contexts: Map<InputContextId, InputContext>,
  contextId: InputContextId,
  enabled: boolean
): void {
  const context = contexts.get(contextId);
  if (!context) {
    throw createInputMissingContextError(contextId);
  }

  contexts.set(contextId, {
    ...context,
    enabled
  });
}
