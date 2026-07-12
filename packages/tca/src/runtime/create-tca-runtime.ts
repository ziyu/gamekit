import { compileTcaRules } from "./compiler";
import { mergeTcaDefinitionSets } from "./definition-set";
import { createTcaTraceStore } from "./trace-store";
import type {
  CreateTcaRuntimeConfig,
  TcaCompiledRule,
  TcaHandlerContext,
  TcaRuntime,
  TcaTraceEntry
} from "./types";

export function createTcaRuntime(config: CreateTcaRuntimeConfig): TcaRuntime {
  const compiled = compileTcaRules(
    config.rules,
    mergeTcaDefinitionSets(config.definitions, config.handlers)
  );
  const traceStore = config.traceStore ?? createTcaTraceStore();
  const executedOnce = new Set<string>();
  let disposed = false;
  let runSequence = 0;

  return {
    rules: compiled.rules,
    traceStore,
    handleEvent(event) {
      if (disposed) {
        return;
      }

      const rules = compiled.rulesByEventType.get(event.type) ?? [];
      for (const rule of rules) {
        runSequence += 1;
        const traceId = `tca-run-${runSequence}`;
        runRule(rule, {
          event,
          eventBus: config.eventBus,
          dataRegistry: config.dataRegistry,
          game: config.game,
          rule: rule.rule,
          traceId,
          correlationId: event.correlationId,
          parentId: event.parentId
        });
      }
    },
    dispose() {
      disposed = true;
      executedOnce.clear();
    }
  };

  function runRule(rule: TcaCompiledRule, ctx: TcaHandlerContext): void {
    if (rule.rule.once && executedOnce.has(rule.rule.id)) {
      traceStore.add(createTrace(rule, ctx, "skipped", "once rule already executed"));
      return;
    }

    if (!rule.trigger.matches(ctx, rule.rule.trigger)) {
      traceStore.add(createTrace(rule, ctx, "skipped", "trigger did not match"));
      return;
    }

    const trace = createTrace(rule, ctx, "passed");

    for (const condition of rule.conditions) {
      try {
        const passed = condition.handler.evaluate(ctx, condition.config);
        trace.conditions.push({
          type: condition.config.type,
          passed
        });
        if (!passed) {
          trace.status = "skipped";
          trace.reason = `condition failed: ${condition.config.type}`;
          trace.actions.push(
            ...rule.actions.map((action) => ({
              type: action.config.type,
              status: "skipped" as const
            }))
          );
          traceStore.add(trace);
          return;
        }
      } catch (error) {
        trace.status = "failed";
        trace.reason = `condition error: ${condition.config.type}`;
        trace.conditions.push({
          type: condition.config.type,
          passed: false,
          error: describeError(error)
        });
        traceStore.add(trace);
        return;
      }
    }

    for (const action of rule.actions) {
      try {
        action.handler.execute(ctx, action.config);
        trace.actions.push({
          type: action.config.type,
          status: "executed"
        });
      } catch (error) {
        trace.status = "failed";
        trace.reason = `action error: ${action.config.type}`;
        trace.actions.push({
          type: action.config.type,
          status: "failed",
          error: describeError(error)
        });
        traceStore.add(trace);
        return;
      }
    }

    if (rule.rule.once) {
      executedOnce.add(rule.rule.id);
    }
    traceStore.add(trace);
  }
}

function createTrace(
  rule: TcaCompiledRule,
  ctx: TcaHandlerContext,
  status: TcaTraceEntry["status"],
  reason?: string
): TcaTraceEntry {
  return {
    id: ctx.traceId,
    ruleId: rule.rule.id,
    eventType: ctx.event.type,
    timestamp: ctx.event.timestamp,
    ...(ctx.correlationId === undefined ? {} : { correlationId: ctx.correlationId }),
    ...(ctx.parentId === undefined ? {} : { parentId: ctx.parentId }),
    status,
    ...(reason === undefined ? {} : { reason }),
    conditions: [],
    actions: []
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
