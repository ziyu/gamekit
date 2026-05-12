import { createTcaError } from "./errors";
import type { TcaActionDefinition, TcaDefinitionSet, TcaTriggerDefinition } from "./types";

export function createCoreTcaDefinitions(): TcaDefinitionSet {
  return {
    triggers: [createEventTypeTriggerDefinition()],
    actions: [createEventEmitActionDefinition()]
  };
}

export function createEventTypeTriggerDefinition(): TcaTriggerDefinition {
  return {
    type: "event.type",
    description: "Matches a low-frequency EventBus event by type.",
    eventTypes(config) {
      const eventType = readStringArg(config.args, "eventType");
      return eventType ? [eventType] : [];
    },
    matches(ctx, config) {
      const eventType = readStringArg(config.args, "eventType");
      return eventType === ctx.event.type;
    }
  };
}

export function createEventEmitActionDefinition(): TcaActionDefinition {
  return {
    type: "event.emit",
    description: "Emits a low-frequency EventBus event.",
    execute(ctx, config) {
      const eventType = readStringArg(config.args, "eventType");
      if (!eventType) {
        throw createTcaError("tca.invalid_action_args", "event.emit action requires eventType");
      }
      const payload = config.args?.payload ?? {};
      ctx.eventBus.emit(eventType, payload, "tca");
    }
  };
}

function readStringArg(
  args: Record<string, unknown> | undefined,
  name: string
): string | undefined {
  const value = args?.[name];
  return typeof value === "string" ? value : undefined;
}
