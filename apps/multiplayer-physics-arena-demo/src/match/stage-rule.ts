import type { ArenaStageDefinition } from "../content/types";
import { resolveArenaQualificationCount } from "./qualification-policy";

export type ArenaStageCompletionReason =
  | "all-eliminated"
  | "last-standing"
  | "qualification-reached"
  | "qualification-locked"
  | "field-reduced"
  | "deadline";

export type ArenaStageRuleDecision =
  | { status: "continue" }
  | {
      status: "complete";
      reason: ArenaStageCompletionReason;
      winnerParticipantId?: string | undefined;
    };

export type ArenaStageRuleDiagnostics = {
  evaluations: number;
  completions: number;
  invalidInputs: number;
  disposed: boolean;
};

export type ArenaStageRule = {
  readonly id: string;
  readonly kind: ArenaStageDefinition["kind"];
  readonly qualificationCount: number;
  readonly durationTicks: number;
  evaluate(input: {
    elapsedTicks: number;
    entrantParticipantIds: readonly string[];
    activeParticipantIds: readonly string[];
    completedParticipantIds?: readonly string[] | undefined;
  }): ArenaStageRuleDecision;
  diagnostics(): ArenaStageRuleDiagnostics;
  dispose(): void;
};

export function createArenaStageRule(definition: Readonly<ArenaStageDefinition>): ArenaStageRule {
  if (
    definition.id.length === 0 ||
    !Number.isSafeInteger(definition.qualificationCount) ||
    definition.qualificationCount <= 0 ||
    !Number.isSafeInteger(definition.durationTicks) ||
    definition.durationTicks <= 0
  ) {
    throw new Error(`Invalid Arena stage rule definition: ${definition.id}`);
  }
  let evaluations = 0;
  let completions = 0;
  let invalidInputs = 0;
  let disposed = false;

  return {
    id: definition.id,
    kind: definition.kind,
    qualificationCount: definition.qualificationCount,
    durationTicks: definition.durationTicks,
    evaluate(input) {
      assertActive();
      evaluations += 1;
      if (
        !Number.isSafeInteger(input.elapsedTicks) ||
        input.elapsedTicks < 0 ||
        hasDuplicates(input.entrantParticipantIds) ||
        hasDuplicates(input.activeParticipantIds) ||
        input.activeParticipantIds.some((id) => !input.entrantParticipantIds.includes(id)) ||
        hasDuplicates(input.completedParticipantIds ?? []) ||
        (input.completedParticipantIds ?? []).some(
          (id) => !input.entrantParticipantIds.includes(id)
        )
      ) {
        invalidInputs += 1;
        throw new Error(`Invalid Arena stage rule input: ${definition.id}`);
      }
      const qualificationCount = resolveArenaQualificationCount(
        definition.qualificationCount,
        input.entrantParticipantIds.length
      );
      const completedCount = input.completedParticipantIds?.length ?? 0;
      if (definition.kind === "qualifier") {
        if (completedCount + input.activeParticipantIds.length === 0) {
          completions += 1;
          return { status: "complete", reason: "all-eliminated" };
        }
        if (completedCount >= qualificationCount) {
          completions += 1;
          return { status: "complete", reason: "qualification-reached" };
        }
        if (
          completedCount > 0 &&
          completedCount + input.activeParticipantIds.length <= qualificationCount
        ) {
          completions += 1;
          return { status: "complete", reason: "qualification-locked" };
        }
      } else if (input.activeParticipantIds.length === 0) {
        completions += 1;
        return { status: "complete", reason: "all-eliminated" };
      }
      if (definition.kind === "final" && input.activeParticipantIds.length === 1) {
        completions += 1;
        return {
          status: "complete",
          reason: "last-standing",
          winnerParticipantId: input.activeParticipantIds[0]
        };
      }
      if (
        definition.kind === "brawl" &&
        input.activeParticipantIds.length > 0 &&
        input.activeParticipantIds.length <= qualificationCount
      ) {
        completions += 1;
        return { status: "complete", reason: "field-reduced" };
      }
      if (input.elapsedTicks >= definition.durationTicks) {
        completions += 1;
        return { status: "complete", reason: "deadline" };
      }
      return { status: "continue" };
    },
    diagnostics() {
      return { evaluations, completions, invalidInputs, disposed };
    },
    dispose() {
      disposed = true;
    }
  };

  function assertActive(): void {
    if (disposed) throw new Error("Arena stage rule is disposed");
  }
}

function hasDuplicates(values: readonly string[]): boolean {
  return values.some((value) => value.length === 0) || new Set(values).size !== values.length;
}
