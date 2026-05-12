import type { DataKindDefinition } from "@gamekit/data";
import type { TcaRule } from "./types";

export const TCA_RULE_KIND = "tcaRule";

export function createTcaRuleDataKind(kind = TCA_RULE_KIND): DataKindDefinition<TcaRule> {
  return {
    kind,
    getTags: (rule) => rule.tags ?? [],
    validate(document) {
      const diagnostics = [];
      const rule = document.value;

      if (!rule.id || typeof rule.id !== "string") {
        diagnostics.push({
          code: "tca.rule_missing_id",
          message: "TCA rule requires id",
          severity: "error" as const,
          key: document
        });
      }

      if (!rule.trigger || typeof rule.trigger.type !== "string") {
        diagnostics.push({
          code: "tca.rule_missing_trigger",
          message: "TCA rule requires trigger.type",
          severity: "error" as const,
          key: document
        });
      }

      if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
        diagnostics.push({
          code: "tca.rule_missing_actions",
          message: "TCA rule requires at least one action",
          severity: "error" as const,
          key: document
        });
      }

      return diagnostics;
    }
  };
}
