import { createTcaDefinitionRegistry, type TcaHandlerRegistry } from "./handler-registry";
import type { TcaCompiledRule, TcaCompiledRules, TcaDefinitionSet, TcaRule } from "./types";

export function compileTcaRules(
  rules: TcaRule[],
  definitions: TcaDefinitionSet = {}
): TcaCompiledRules {
  const registry = createTcaDefinitionRegistry(definitions);
  const compiled = rules
    .filter((rule) => rule.enabled !== false)
    .map((rule) => compileRule(rule, registry))
    .sort(compareCompiledRules);
  const rulesByEventType = new Map<string, TcaCompiledRule[]>();

  for (const rule of compiled) {
    for (const eventType of rule.eventTypes) {
      const indexedRules = rulesByEventType.get(eventType) ?? [];
      indexedRules.push(rule);
      rulesByEventType.set(eventType, indexedRules);
    }
  }

  return {
    rules: compiled,
    rulesByEventType
  };
}

function compileRule(rule: TcaRule, registry: TcaHandlerRegistry): TcaCompiledRule {
  const trigger = registry.trigger(rule.trigger.type);
  const eventTypes = trigger.eventTypes?.(rule.trigger) ?? [];

  return {
    rule,
    trigger,
    conditions: (rule.conditions ?? []).map((config) => ({
      config,
      handler: registry.condition(config.type)
    })),
    actions: rule.actions.map((config) => ({
      config,
      handler: registry.action(config.type)
    })),
    eventTypes
  };
}

function compareCompiledRules(left: TcaCompiledRule, right: TcaCompiledRule): number {
  const priority = (right.rule.priority ?? 0) - (left.rule.priority ?? 0);
  return priority === 0 ? left.rule.id.localeCompare(right.rule.id) : priority;
}
