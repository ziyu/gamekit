export type ArenaImpactCause = "participant" | "environment" | "self";

export type ArenaImpactLedgerEntry = {
  id: string;
  hitTicket: string;
  sourceParticipantId?: string | undefined;
  targetParticipantId: string;
  itemOrAbilityId?: string | undefined;
  impulseMagnitude: number;
  tick: number;
  cause: ArenaImpactCause;
};

export type ArenaKnockoutAttribution = {
  id: string;
  eliminationId: string;
  targetParticipantId: string;
  tick: number;
  kind: "participant" | "environment";
  knockoutParticipantId?: string | undefined;
  assistParticipantIds: string[];
  impactIds: string[];
};

export type ArenaImpactLedgerDiagnostics = {
  entries: number;
  attributions: number;
  recorded: number;
  duplicates: number;
  invalidEntries: number;
  capacityRejections: number;
  prunedEntries: number;
  attributionConflicts: number;
  disposed: boolean;
};

export type ArenaImpactLedger = {
  record(entry: ArenaImpactLedgerEntry): "applied" | "duplicate" | "invalid";
  attribute(input: { eliminationId: string; targetParticipantId: string; tick: number }): {
    status: "applied" | "duplicate" | "capacity";
    attribution?: ArenaKnockoutAttribution;
  };
  entries(): ArenaImpactLedgerEntry[];
  attributions(): ArenaKnockoutAttribution[];
  prune(tick: number): void;
  reset(): void;
  diagnostics(): ArenaImpactLedgerDiagnostics;
  dispose(): void;
};

export function createArenaImpactLedger(
  options: {
    entryCapacity?: number | undefined;
    attributionCapacity?: number | undefined;
    retentionTicks?: number | undefined;
    knockoutWindowTicks?: number | undefined;
    assistWindowTicks?: number | undefined;
    impulseThreshold?: number | undefined;
    maxAssists?: number | undefined;
  } = {}
): ArenaImpactLedger {
  const entryCapacity = positiveInteger(options.entryCapacity, 256);
  const attributionCapacity = positiveInteger(options.attributionCapacity, 64);
  const retentionTicks = positiveInteger(options.retentionTicks, 600);
  const knockoutWindowTicks = positiveInteger(options.knockoutWindowTicks, 240);
  const assistWindowTicks = positiveInteger(options.assistWindowTicks, 360);
  const impulseThreshold = positiveNumber(options.impulseThreshold, 1);
  const maxAssists = positiveInteger(options.maxAssists, 3);
  if (knockoutWindowTicks > retentionTicks || assistWindowTicks > retentionTicks) {
    throw new Error("Arena impact attribution windows must fit ledger retention");
  }
  const entryById = new Map<string, ArenaImpactLedgerEntry>();
  const hitTickets = new Set<string>();
  const attributionById = new Map<string, ArenaKnockoutAttribution>();
  let recorded = 0;
  let duplicates = 0;
  let invalidEntries = 0;
  let capacityRejections = 0;
  let prunedEntries = 0;
  let attributionConflicts = 0;
  let disposed = false;

  return {
    record(entry) {
      assertActive();
      if (!validEntry(entry)) {
        invalidEntries += 1;
        return "invalid";
      }
      if (entryById.has(entry.id) || hitTickets.has(entry.hitTicket)) {
        duplicates += 1;
        return "duplicate";
      }
      pruneEntries(entry.tick);
      if (entryById.size >= entryCapacity) {
        const oldest = orderedEntries()[0];
        if (oldest !== undefined) removeEntry(oldest);
      }
      entryById.set(entry.id, structuredClone(entry));
      hitTickets.add(entry.hitTicket);
      recorded += 1;
      return "applied";
    },
    attribute(input) {
      assertActive();
      const existing = attributionById.get(input.eliminationId);
      if (existing !== undefined) {
        if (
          existing.targetParticipantId !== input.targetParticipantId ||
          existing.tick !== input.tick
        ) {
          attributionConflicts += 1;
          throw new Error(`Conflicting Arena elimination attribution: ${input.eliminationId}`);
        }
        duplicates += 1;
        return { status: "duplicate", attribution: structuredClone(existing) };
      }
      if (
        input.eliminationId.length === 0 ||
        input.targetParticipantId.length === 0 ||
        !nonNegativeInteger(input.tick)
      ) {
        attributionConflicts += 1;
        throw new Error("Invalid Arena elimination attribution input");
      }
      if (attributionById.size >= attributionCapacity) {
        capacityRejections += 1;
        return { status: "capacity" };
      }
      pruneEntries(input.tick);
      const candidates = orderedEntries()
        .filter(
          (entry) =>
            entry.targetParticipantId === input.targetParticipantId &&
            entry.tick <= input.tick &&
            entry.tick >= input.tick - assistWindowTicks &&
            entry.cause === "participant" &&
            entry.sourceParticipantId !== undefined &&
            entry.sourceParticipantId !== input.targetParticipantId &&
            entry.impulseMagnitude >= impulseThreshold
        )
        .sort(compareAttributionCandidate);
      const knockout = candidates.find((entry) => entry.tick >= input.tick - knockoutWindowTicks);
      const assists = distinctAssists(candidates, knockout?.sourceParticipantId, maxAssists);
      const attribution: ArenaKnockoutAttribution = {
        id: `${input.eliminationId}:attribution`,
        eliminationId: input.eliminationId,
        targetParticipantId: input.targetParticipantId,
        tick: input.tick,
        kind: knockout === undefined ? "environment" : "participant",
        ...(knockout?.sourceParticipantId === undefined
          ? {}
          : { knockoutParticipantId: knockout.sourceParticipantId }),
        assistParticipantIds: assists.map((entry) => entry.sourceParticipantId!),
        impactIds: [knockout, ...assists]
          .filter((entry): entry is ArenaImpactLedgerEntry => entry !== undefined)
          .map((entry) => entry.id)
      };
      attributionById.set(input.eliminationId, attribution);
      return { status: "applied", attribution: structuredClone(attribution) };
    },
    entries() {
      assertActive();
      return orderedEntries().map((entry) => structuredClone(entry));
    },
    attributions() {
      assertActive();
      return [...attributionById.values()]
        .sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id))
        .map((entry) => structuredClone(entry));
    },
    prune(tick) {
      assertActive();
      if (!nonNegativeInteger(tick)) throw new Error("Arena impact prune tick must be valid");
      pruneEntries(tick);
    },
    reset() {
      assertActive();
      entryById.clear();
      hitTickets.clear();
      attributionById.clear();
    },
    diagnostics() {
      return {
        entries: entryById.size,
        attributions: attributionById.size,
        recorded,
        duplicates,
        invalidEntries,
        capacityRejections,
        prunedEntries,
        attributionConflicts,
        disposed
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      entryById.clear();
      hitTickets.clear();
      attributionById.clear();
    }
  };

  function orderedEntries(): ArenaImpactLedgerEntry[] {
    return [...entryById.values()].sort(
      (left, right) => left.tick - right.tick || left.id.localeCompare(right.id)
    );
  }

  function pruneEntries(tick: number): void {
    for (const entry of orderedEntries()) {
      if (entry.tick > tick - retentionTicks) continue;
      removeEntry(entry);
      prunedEntries += 1;
    }
  }

  function removeEntry(entry: ArenaImpactLedgerEntry): void {
    entryById.delete(entry.id);
    hitTickets.delete(entry.hitTicket);
  }

  function assertActive(): void {
    if (disposed) throw new Error("Arena impact ledger is disposed");
  }
}

function distinctAssists(
  candidates: readonly ArenaImpactLedgerEntry[],
  knockoutParticipantId: string | undefined,
  maximum: number
): ArenaImpactLedgerEntry[] {
  const seen = new Set<string>(knockoutParticipantId === undefined ? [] : [knockoutParticipantId]);
  const result: ArenaImpactLedgerEntry[] = [];
  for (const entry of candidates) {
    const source = entry.sourceParticipantId;
    if (source === undefined || seen.has(source)) continue;
    seen.add(source);
    result.push(entry);
    if (result.length >= maximum) break;
  }
  return result;
}

function compareAttributionCandidate(
  left: ArenaImpactLedgerEntry,
  right: ArenaImpactLedgerEntry
): number {
  return (
    right.tick - left.tick ||
    right.impulseMagnitude - left.impulseMagnitude ||
    (left.sourceParticipantId ?? "").localeCompare(right.sourceParticipantId ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function validEntry(entry: ArenaImpactLedgerEntry): boolean {
  return (
    entry.id.length > 0 &&
    entry.hitTicket.length > 0 &&
    entry.targetParticipantId.length > 0 &&
    (entry.sourceParticipantId === undefined || entry.sourceParticipantId.length > 0) &&
    Number.isFinite(entry.impulseMagnitude) &&
    entry.impulseMagnitude >= 0 &&
    nonNegativeInteger(entry.tick) &&
    (entry.cause !== "participant" || entry.sourceParticipantId !== undefined)
  );
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
