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
      cancelActive((active) => active.actionId === actionId);
    },
    setActionBindings(actionId, bindings) {
      if (!actions.has(actionId)) {
        throw createInputMissingActionError(actionId);
      }
      actionBindings.set(actionId, [...bindings]);
      cancelActive((active) => active.actionId === actionId);
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
      cancelActive((active) => active.contextId === contextId);
    },
    enableContext(contextId) {
      updateContext(contexts, contextId, true);
    },
    disableContext(contextId) {
      updateContext(contexts, contextId, false);
      cancelActive((active) => active.contextId === contextId);
    },
    activeContexts() {
      return sortInputContexts([...contexts.values()].filter(isInputContextEnabled));
    },
    handle(input) {
      refreshActiveInput(activeActions, input);
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

      if (input.phase === "released" || input.phase === "cancelled") {
        emitted.push(
          ...cancelActive(
            (active) => inputIdentity(active.input) === inputIdentity(input),
            input.timestamp
          )
        );
      }
      return emitted;
    },
    tick(frame) {
      const events: InputActionEvent[] = [];

      for (const active of activeActions.values()) {
        const context = contexts.get(active.contextId);
        if (
          !context ||
          !isInputContextEnabled(context) ||
          !contextAcceptsAction(context, active.actionId) ||
          !actionAcceptsInputScope(actions.get(active.actionId), active.input)
        ) {
          activeActions.delete(activeActionKey(active));
          continue;
        }
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

        events.push(event);
        for (const listener of listeners) {
          listener(event);
        }
      }

      return events;
    },
    cancelAll() {
      return cancelActive(() => true);
    },
    onAction(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };

  function cancelActive(
    matches: (active: InputActionEvent) => boolean,
    timestamp?: number
  ): InputActionEvent[] {
    const cancelled = [...activeActions.entries()].filter(([, active]) => matches(active));
    for (const [key] of cancelled) activeActions.delete(key);
    const events = cancelled.map(([, active]) => {
      const input: NormalizedInputEvent = {
        ...active.input,
        id: `${active.input.id}:cancelled:${++heldSequence}`,
        phase: "cancelled",
        timestamp: timestamp ?? active.timestamp
      };
      const event: InputActionEvent = {
        ...active,
        id: createInputActionEventId(input, active.actionId),
        input,
        phase: "cancelled",
        value: 0,
        timestamp: input.timestamp
      };
      return event;
    });
    const errors: unknown[] = [];
    for (const event of events) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Input cancellation failed");
    return events;
  }
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
  action: InputActionDefinition | undefined,
  input: { scope?: string }
): boolean {
  if (!action) return false;
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

function refreshActiveInput(
  activeActions: Map<string, InputActionEvent>,
  input: NormalizedInputEvent
): void {
  if (input.phase !== "moved") {
    return;
  }

  const inputKey = inputIdentity(input);
  const value = inputValue(input);
  for (const [key, event] of activeActions) {
    if (inputIdentity(event.input) !== inputKey) {
      continue;
    }
    activeActions.set(key, {
      ...event,
      value,
      input,
      timestamp: input.timestamp,
      ...(input.source === undefined ? {} : { source: input.source })
    });
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

function activeActionKey(event: InputActionEvent): string {
  return `${event.contextId}:${event.actionId}:${inputIdentity(event.input)}`;
}

function inputIdentity(input: {
  device: string;
  deviceId?: string;
  code?: string;
  button?: string;
  pointerId?: string;
}): string {
  return `${input.device}:${input.deviceId ?? ""}:${input.code ?? ""}:${input.button ?? ""}:${input.pointerId ?? ""}`;
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
