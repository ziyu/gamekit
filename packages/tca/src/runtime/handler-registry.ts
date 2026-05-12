import { createCoreTcaDefinitions } from "./built-in-definitions";
import { mergeTcaDefinitionSets } from "./definition-set";
import { createTcaError } from "./errors";
import type {
  TcaActionHandler,
  TcaConditionHandler,
  TcaDefinitionSet,
  TcaHandlerSet,
  TcaTriggerHandler
} from "./types";

export type TcaHandlerRegistry = {
  trigger(type: string): TcaTriggerHandler;
  condition(type: string): TcaConditionHandler;
  action(type: string): TcaActionHandler;
};

export function createTcaHandlerRegistry(handlers: TcaHandlerSet = {}): TcaHandlerRegistry {
  return createTcaDefinitionRegistry(handlers);
}

export function createTcaDefinitionRegistry(
  definitions: TcaDefinitionSet = {}
): TcaHandlerRegistry {
  const merged = mergeTcaDefinitionSets(createCoreTcaDefinitions(), definitions);
  const triggers = indexHandlers<TcaTriggerHandler>(merged.triggers ?? []);
  const conditions = indexHandlers<TcaConditionHandler>(merged.conditions ?? []);
  const actions = indexHandlers<TcaActionHandler>(merged.actions ?? []);

  return {
    trigger(type) {
      return requireHandler(triggers, "trigger", type);
    },
    condition(type) {
      return requireHandler(conditions, "condition", type);
    },
    action(type) {
      return requireHandler(actions, "action", type);
    }
  };
}

function indexHandlers<THandler extends { type: string }>(
  handlers: THandler[]
): Map<string, THandler> {
  const indexed = new Map<string, THandler>();
  for (const handler of handlers) {
    if (indexed.has(handler.type)) {
      throw createTcaError("tca.duplicate_handler", `Duplicate TCA handler: ${handler.type}`, {
        type: handler.type
      });
    }
    indexed.set(handler.type, handler);
  }
  return indexed;
}

function requireHandler<THandler>(
  handlers: Map<string, THandler>,
  kind: string,
  type: string
): THandler {
  const handler = handlers.get(type);
  if (!handler) {
    throw createTcaError("tca.missing_handler", `Missing TCA ${kind} handler: ${type}`, {
      kind,
      type
    });
  }
  return handler;
}
