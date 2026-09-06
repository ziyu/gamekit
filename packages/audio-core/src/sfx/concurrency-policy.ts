import type { PlaybackInstanceState } from "../contracts/playback";
import type { SfxConcurrencyDefinition, SfxEventDefinition } from "./sfx-event-definition";

export type SfxConcurrencyDecision =
  | { accepted: true; replaceInstanceIds: string[] }
  | { accepted: false };

export function decideSfxConcurrency(input: {
  event: SfxEventDefinition;
  definitions: Map<string, SfxConcurrencyDefinition>;
  active: PlaybackInstanceState[];
  ownerId?: string | undefined;
  emitterId?: string | undefined;
  priority: number;
  now: number;
  retriggered: Map<string, number>;
}): SfxConcurrencyDecision {
  const replacements = new Set<string>();
  for (const concurrencyId of input.event.concurrency ?? []) {
    const definition = input.definitions.get(concurrencyId) as SfxConcurrencyDefinition;
    const key = concurrencyKey(definition, input);
    const lastTriggeredAt = input.retriggered.get(key);
    if (
      (definition.retriggerMs ?? 0) > 0 &&
      lastTriggeredAt !== undefined &&
      input.now - lastTriggeredAt < (definition.retriggerMs ?? 0)
    ) {
      return { accepted: false };
    }
    let scoped = input.active.filter(
      (instance) =>
        !replacements.has(instance.id) &&
        instance.tags.includes(`concurrency:${concurrencyId}`) &&
        sameScope(definition, instance, input)
    );
    while (scoped.length >= definition.maxInstances) {
      const candidate = selectCandidate(
        scoped,
        definition.resolution ?? "stop-lowest-priority",
        input.priority
      );
      if (candidate === undefined) {
        return { accepted: false };
      }
      replacements.add(candidate.id);
      scoped = scoped.filter((instance) => instance.id !== candidate.id);
    }
  }
  return { accepted: true, replaceInstanceIds: [...replacements] };
}

export function rememberSfxConcurrency(input: {
  event: SfxEventDefinition;
  definitions: Map<string, SfxConcurrencyDefinition>;
  ownerId?: string | undefined;
  emitterId?: string | undefined;
  now: number;
  retriggered: Map<string, number>;
}): void {
  for (const id of input.event.concurrency ?? []) {
    const definition = input.definitions.get(id);
    if (definition !== undefined) {
      const key = concurrencyKey(definition, input);
      input.retriggered.delete(key);
      input.retriggered.set(key, input.now);
    }
  }
}

function sameScope(
  definition: SfxConcurrencyDefinition,
  instance: PlaybackInstanceState,
  incoming: { ownerId?: string | undefined; emitterId?: string | undefined }
): boolean {
  switch (definition.scope ?? "global") {
    case "global":
      return true;
    case "owner":
      return instance.ownerId === incoming.ownerId;
    case "emitter":
      return instance.emitterId === incoming.emitterId;
  }
}

function concurrencyKey(
  definition: SfxConcurrencyDefinition,
  value: { ownerId?: string | undefined; emitterId?: string | undefined }
): string {
  switch (definition.scope ?? "global") {
    case "global":
      return `${definition.id}:global`;
    case "owner":
      return `${definition.id}:owner:${value.ownerId ?? "none"}`;
    case "emitter":
      return `${definition.id}:emitter:${value.emitterId ?? "none"}`;
  }
}

function selectCandidate(
  candidates: PlaybackInstanceState[],
  resolution: SfxConcurrencyDefinition["resolution"],
  incomingPriority: number
): PlaybackInstanceState | undefined {
  if (resolution === "reject-new" || candidates.length === 0) {
    return undefined;
  }
  const compare = (left: PlaybackInstanceState, right: PlaybackInstanceState): number => {
    switch (resolution) {
      case "stop-oldest":
        return left.startedAt - right.startedAt || left.id.localeCompare(right.id);
      case "stop-quietest":
        return left.effectiveVolume - right.effectiveVolume || left.id.localeCompare(right.id);
      case "stop-lowest-priority":
        return (
          left.priority - right.priority ||
          left.startedAt - right.startedAt ||
          left.id.localeCompare(right.id)
        );
      default:
        return 0;
    }
  };
  let candidate = candidates[0];
  for (let index = 1; index < candidates.length; index += 1) {
    const current = candidates[index] as PlaybackInstanceState;
    if (candidate === undefined || compare(current, candidate) < 0) {
      candidate = current;
    }
  }
  return resolution === "stop-lowest-priority" &&
    candidate !== undefined &&
    candidate.priority > incomingPriority
    ? undefined
    : candidate;
}
