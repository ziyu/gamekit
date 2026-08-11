export type ArenaParticipantStatus =
  | "lobby"
  | "active"
  | "qualified"
  | "eliminated"
  | "spectator"
  | "next-match"
  | "disconnected"
  | "finished";

export type ArenaParticipantKind = "human-slot" | "bot" | "spectator";

export type ArenaParticipantTransitionReason =
  | "match-started"
  | "stage-qualified"
  | "stage-eliminated"
  | "stage-finished"
  | "spectating"
  | "late-join"
  | "peer-disconnected"
  | "peer-reconnected"
  | "next-stage"
  | "rematch-reset";

export type ArenaParticipantRecord = {
  id: string;
  kind: ArenaParticipantKind;
  slot: number;
  actorMemberId?: string | undefined;
  peerId?: string | undefined;
  connected: boolean;
  status: ArenaParticipantStatus;
  resumeStatus?: ArenaParticipantStatus | undefined;
  stageInstanceId?: string | undefined;
  registeredAtTick: number;
  statusChangedAtTick: number;
  revision: number;
};

export type ArenaParticipantTransition = {
  sequence: number;
  participantId: string;
  from: ArenaParticipantStatus;
  to: ArenaParticipantStatus;
  reason: ArenaParticipantTransitionReason;
  tick: number;
  stageInstanceId?: string | undefined;
};

export type ArenaParticipantMutationResult = {
  status: "applied" | "unchanged" | "missing" | "conflict" | "invalid-transition" | "capacity";
  participant?: ArenaParticipantRecord | undefined;
};

export type ArenaParticipantRegistryDiagnostics = {
  participants: number;
  connectedPeers: number;
  registered: number;
  transitions: number;
  invalidTransitions: number;
  conflicts: number;
  capacityRejections: number;
  disconnects: number;
  reconnects: number;
  traceEntries: number;
  traceDrops: number;
  disposed: boolean;
};

export type ArenaParticipantRegistry = {
  register(input: {
    id: string;
    kind: ArenaParticipantKind;
    slot: number;
    actorMemberId?: string | undefined;
    status?: ArenaParticipantStatus | undefined;
    tick: number;
  }): ArenaParticipantMutationResult;
  bindPeer(participantId: string, peerId: string, tick: number): ArenaParticipantMutationResult;
  disconnectPeer(peerId: string, tick: number): ArenaParticipantMutationResult;
  reconnectPeer(peerId: string, tick: number): ArenaParticipantMutationResult;
  transition(
    participantId: string,
    to: ArenaParticipantStatus,
    context: {
      reason: ArenaParticipantTransitionReason;
      tick: number;
      stageInstanceId?: string | undefined;
    }
  ): ArenaParticipantMutationResult;
  resetForMatch(tick: number): void;
  participant(participantId: string): ArenaParticipantRecord | undefined;
  byPeerId(peerId: string): ArenaParticipantRecord | undefined;
  byActorMemberId(memberId: string): ArenaParticipantRecord | undefined;
  list(): ArenaParticipantRecord[];
  connectedBindings(): Array<{ peerId: string; participantId: string; actorMemberId?: string }>;
  competitiveParticipantIds(): string[];
  activeActorMemberIds(): string[];
  eliminatedActorMemberIds(): string[];
  trace(): ArenaParticipantTransition[];
  diagnostics(): ArenaParticipantRegistryDiagnostics;
  dispose(): void;
};

const DEFAULT_CAPACITY = 64;
const DEFAULT_TRACE_CAPACITY = 256;

const TRANSITIONS: Readonly<Record<ArenaParticipantStatus, readonly ArenaParticipantStatus[]>> = {
  lobby: ["active", "next-match", "disconnected"],
  active: ["qualified", "eliminated", "finished", "disconnected"],
  qualified: ["active", "spectator", "disconnected"],
  eliminated: ["spectator", "lobby", "disconnected"],
  spectator: ["lobby", "next-match", "disconnected"],
  "next-match": ["lobby", "disconnected"],
  disconnected: [
    "lobby",
    "active",
    "qualified",
    "eliminated",
    "spectator",
    "next-match",
    "finished"
  ],
  finished: ["spectator", "lobby", "disconnected"]
};

export function createArenaParticipantRegistry(
  options: {
    capacity?: number | undefined;
    traceCapacity?: number | undefined;
  } = {}
): ArenaParticipantRegistry {
  const capacity = positiveInteger(options.capacity, DEFAULT_CAPACITY);
  const traceCapacity = positiveInteger(options.traceCapacity, DEFAULT_TRACE_CAPACITY);
  const records = new Map<string, ArenaParticipantRecord>();
  const transitions: ArenaParticipantTransition[] = [];
  let transitionSequence = 0;
  let registered = 0;
  let transitionCount = 0;
  let invalidTransitions = 0;
  let conflicts = 0;
  let capacityRejections = 0;
  let disconnects = 0;
  let reconnects = 0;
  let traceDrops = 0;
  let disposed = false;

  return {
    register(input) {
      assertActive();
      const existing = records.get(input.id);
      if (existing !== undefined) {
        conflicts += 1;
        return { status: "conflict", participant: cloneRecord(existing) };
      }
      if (
        records.size >= capacity ||
        !validId(input.id) ||
        !Number.isSafeInteger(input.slot) ||
        input.slot < 0 ||
        !validTick(input.tick) ||
        (input.actorMemberId !== undefined && !validId(input.actorMemberId))
      ) {
        capacityRejections += records.size >= capacity ? 1 : 0;
        conflicts += records.size >= capacity ? 0 : 1;
        return { status: records.size >= capacity ? "capacity" : "conflict" };
      }
      if (
        [...records.values()].some(
          (record) =>
            record.slot === input.slot ||
            (input.actorMemberId !== undefined && record.actorMemberId === input.actorMemberId)
        )
      ) {
        conflicts += 1;
        return { status: "conflict" };
      }
      const record: ArenaParticipantRecord = {
        id: input.id,
        kind: input.kind,
        slot: input.slot,
        ...(input.actorMemberId === undefined ? {} : { actorMemberId: input.actorMemberId }),
        connected: false,
        status: input.status ?? "lobby",
        registeredAtTick: input.tick,
        statusChangedAtTick: input.tick,
        revision: 1
      };
      records.set(record.id, record);
      registered += 1;
      return { status: "applied", participant: cloneRecord(record) };
    },
    bindPeer(participantId, peerId, tick) {
      assertActive();
      const record = records.get(participantId);
      if (record === undefined) return { status: "missing" };
      if (
        record.kind === "bot" ||
        !validId(peerId) ||
        !validTick(tick) ||
        [...records.values()].some(
          (candidate) => candidate.id !== participantId && candidate.peerId === peerId
        ) ||
        (record.peerId !== undefined && record.peerId !== peerId)
      ) {
        conflicts += 1;
        return { status: "conflict", participant: cloneRecord(record) };
      }
      if (record.peerId === peerId && record.connected) {
        return { status: "unchanged", participant: cloneRecord(record) };
      }
      record.peerId = peerId;
      record.connected = true;
      record.revision += 1;
      if (record.status === "disconnected") {
        reconnectRecord(record, tick);
      }
      return { status: "applied", participant: cloneRecord(record) };
    },
    disconnectPeer(peerId, tick) {
      assertActive();
      const record = findByPeerId(peerId);
      if (record === undefined) return { status: "missing" };
      if (!record.connected && record.status === "disconnected") {
        return { status: "unchanged", participant: cloneRecord(record) };
      }
      record.connected = false;
      const result = transitionRecord(record, "disconnected", {
        reason: "peer-disconnected",
        tick,
        stageInstanceId: record.stageInstanceId
      });
      if (result.status === "applied") disconnects += 1;
      return result;
    },
    reconnectPeer(peerId, tick) {
      assertActive();
      const record = findByPeerId(peerId);
      if (record === undefined) return { status: "missing" };
      if (record.connected && record.status !== "disconnected") {
        return { status: "unchanged", participant: cloneRecord(record) };
      }
      record.connected = true;
      return reconnectRecord(record, tick);
    },
    transition(participantId, to, context) {
      assertActive();
      const record = records.get(participantId);
      if (record === undefined) return { status: "missing" };
      return transitionRecord(record, to, context);
    },
    resetForMatch(tick) {
      assertActive();
      for (const record of orderedRecords()) {
        const resetStatus = record.actorMemberId === undefined ? "next-match" : "lobby";
        if (record.status === "disconnected") {
          record.resumeStatus = resetStatus;
          record.stageInstanceId = undefined;
          record.revision += 1;
          continue;
        }
        transitionRecord(record, resetStatus, { reason: "rematch-reset", tick });
      }
    },
    participant(participantId) {
      assertActive();
      const record = records.get(participantId);
      return record === undefined ? undefined : cloneRecord(record);
    },
    byPeerId(peerId) {
      assertActive();
      const record = findByPeerId(peerId);
      return record === undefined ? undefined : cloneRecord(record);
    },
    byActorMemberId(memberId) {
      assertActive();
      const record = orderedRecords().find((candidate) => candidate.actorMemberId === memberId);
      return record === undefined ? undefined : cloneRecord(record);
    },
    list() {
      assertActive();
      return orderedRecords().map(cloneRecord);
    },
    connectedBindings() {
      assertActive();
      return orderedRecords().flatMap((record) =>
        record.connected && record.peerId !== undefined
          ? [
              {
                peerId: record.peerId,
                participantId: record.id,
                ...(record.actorMemberId === undefined
                  ? {}
                  : { actorMemberId: record.actorMemberId })
              }
            ]
          : []
      );
    },
    competitiveParticipantIds() {
      assertActive();
      return orderedRecords()
        .filter(isCompetitive)
        .map((record) => record.id);
    },
    activeActorMemberIds() {
      assertActive();
      return orderedRecords().flatMap((record) =>
        isCompetitive(record) && record.actorMemberId !== undefined ? [record.actorMemberId] : []
      );
    },
    eliminatedActorMemberIds() {
      assertActive();
      return orderedRecords().flatMap((record) =>
        record.status === "eliminated" && record.actorMemberId !== undefined
          ? [record.actorMemberId]
          : []
      );
    },
    trace() {
      assertActive();
      return structuredClone(transitions);
    },
    diagnostics() {
      return {
        participants: records.size,
        connectedPeers: [...records.values()].filter((record) => record.connected).length,
        registered,
        transitions: transitionCount,
        invalidTransitions,
        conflicts,
        capacityRejections,
        disconnects,
        reconnects,
        traceEntries: transitions.length,
        traceDrops,
        disposed
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      records.clear();
      transitions.length = 0;
    }
  };

  function transitionRecord(
    record: ArenaParticipantRecord,
    to: ArenaParticipantStatus,
    context: {
      reason: ArenaParticipantTransitionReason;
      tick: number;
      stageInstanceId?: string | undefined;
    }
  ): ArenaParticipantMutationResult {
    if (!validTick(context.tick)) {
      invalidTransitions += 1;
      return { status: "invalid-transition", participant: cloneRecord(record) };
    }
    if (record.status === to) {
      return { status: "unchanged", participant: cloneRecord(record) };
    }
    if (!TRANSITIONS[record.status].includes(to) && context.reason !== "rematch-reset") {
      invalidTransitions += 1;
      return { status: "invalid-transition", participant: cloneRecord(record) };
    }
    const from = record.status;
    if (to === "disconnected") record.resumeStatus = from;
    record.status = to;
    if (from === "disconnected" && to !== "disconnected") record.resumeStatus = undefined;
    record.stageInstanceId = context.stageInstanceId;
    record.statusChangedAtTick = context.tick;
    record.revision += 1;
    transitionSequence += 1;
    transitionCount += 1;
    transitions.push({
      sequence: transitionSequence,
      participantId: record.id,
      from,
      to,
      reason: context.reason,
      tick: context.tick,
      ...(context.stageInstanceId === undefined ? {} : { stageInstanceId: context.stageInstanceId })
    });
    while (transitions.length > traceCapacity) {
      transitions.shift();
      traceDrops += 1;
    }
    return { status: "applied", participant: cloneRecord(record) };
  }

  function reconnectRecord(
    record: ArenaParticipantRecord,
    tick: number
  ): ArenaParticipantMutationResult {
    if (record.status !== "disconnected") {
      return { status: "unchanged", participant: cloneRecord(record) };
    }
    const resumeStatus = record.resumeStatus ?? "lobby";
    const result = transitionRecord(record, resumeStatus, {
      reason: "peer-reconnected",
      tick,
      stageInstanceId: record.stageInstanceId
    });
    if (result.status === "applied") reconnects += 1;
    return result;
  }

  function findByPeerId(peerId: string): ArenaParticipantRecord | undefined {
    return orderedRecords().find((record) => record.peerId === peerId);
  }

  function orderedRecords(): ArenaParticipantRecord[] {
    return [...records.values()].sort(
      (left, right) => left.slot - right.slot || left.id.localeCompare(right.id)
    );
  }

  function assertActive(): void {
    if (disposed) throw new Error("Arena participant registry is disposed");
  }
}

function isCompetitive(record: Readonly<ArenaParticipantRecord>): boolean {
  return (
    record.status === "active" ||
    record.status === "qualified" ||
    (record.status === "disconnected" &&
      (record.resumeStatus === "active" || record.resumeStatus === "qualified"))
  );
}

function cloneRecord(record: Readonly<ArenaParticipantRecord>): ArenaParticipantRecord {
  return { ...record };
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

function validTick(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
