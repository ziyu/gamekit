import type { AiPerceptionFact } from "../perception/perception-fact";
import { cloneAiRecord } from "./clone-runtime-value";

export type AiSharedFactQueries = {
  facts(): AiPerceptionFact[];
  fact(key: string, subjectId?: string | undefined): AiPerceptionFact | undefined;
};

export function createAiSharedFactQueries(queries: AiSharedFactQueries): AiSharedFactQueries {
  return Object.freeze({
    facts() {
      return queries.facts().map(cloneSharedFact);
    },
    fact(key: string, subjectId?: string | undefined) {
      const value = queries.fact(key, subjectId);
      return value === undefined ? undefined : cloneSharedFact(value);
    }
  });
}

function cloneSharedFact(fact: AiPerceptionFact): AiPerceptionFact {
  return {
    ...fact,
    ...(fact.position === undefined ? {} : { position: { ...fact.position } }),
    ...(fact.metadata === undefined ? {} : { metadata: cloneAiRecord(fact.metadata) })
  };
}
