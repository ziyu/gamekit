import { cloneAiRecord } from "../contracts/clone-runtime-value";
import type { AiPerceptionFact } from "./perception-fact";

export type AiPerceptionMemory = Map<string, AiPerceptionFact>;

export function retainAiPerceptionFacts(
  memory: AiPerceptionMemory,
  facts: AiPerceptionFact[],
  limit: number
): void {
  for (const input of facts) {
    if (!input.key || !Number.isFinite(input.observedAt)) {
      continue;
    }
    const fact = cloneAiPerceptionFact(input);
    const key = aiPerceptionFactKey(fact.key, fact.subjectId);
    memory.delete(key);
    memory.set(key, fact);
  }
  while (memory.size > limit) {
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, fact] of memory) {
      if (
        fact.observedAt < oldestAt ||
        (fact.observedAt === oldestAt && (oldestKey === undefined || key < oldestKey))
      ) {
        oldestKey = key;
        oldestAt = fact.observedAt;
      }
    }
    if (oldestKey === undefined) {
      break;
    }
    memory.delete(oldestKey);
  }
}

export function pruneAiPerceptionMemory(memory: AiPerceptionMemory, elapsed: number): void {
  for (const [key, fact] of memory) {
    if (fact.expiresAt !== undefined && fact.expiresAt <= elapsed) {
      memory.delete(key);
    }
  }
}

export function listAiPerceptionFacts(memory: AiPerceptionMemory): AiPerceptionFact[] {
  return [...memory.values()]
    .sort((left, right) =>
      left.key === right.key
        ? (left.subjectId ?? "").localeCompare(right.subjectId ?? "")
        : left.key.localeCompare(right.key)
    )
    .map(cloneAiPerceptionFact);
}

export function readAiPerceptionFact(
  memory: AiPerceptionMemory,
  key: string,
  subjectId?: string | undefined
): AiPerceptionFact | undefined {
  const fact = memory.get(aiPerceptionFactKey(key, subjectId));
  return fact === undefined ? undefined : cloneAiPerceptionFact(fact);
}

export function cloneAiPerceptionFact(fact: AiPerceptionFact): AiPerceptionFact {
  return {
    ...fact,
    ...(fact.position === undefined ? {} : { position: { ...fact.position } }),
    ...(fact.metadata === undefined ? {} : { metadata: cloneAiRecord(fact.metadata) })
  };
}

function aiPerceptionFactKey(key: string, subjectId: string | undefined): string {
  return `${key}\u0000${subjectId ?? ""}`;
}
