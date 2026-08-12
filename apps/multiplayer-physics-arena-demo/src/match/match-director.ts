import type { ArenaStageKind } from "../content/types";
import type { ArenaMatchPhase } from "../shared/config";
import type { ArenaStageCompletionReason, ArenaStageRule } from "./stage-rule";

export type ArenaMatchDirectorTransitionReason =
  | "roster-ready"
  | "roster-empty"
  | "countdown-complete"
  | ArenaStageCompletionReason
  | "results-complete";

export type ArenaMatchDirectorTraceEntry = {
  sequence: number;
  from: ArenaMatchPhase;
  to: ArenaMatchPhase;
  reason: ArenaMatchDirectorTransitionReason;
  tick: number;
  phaseInstanceId: string;
  stageInstanceId: string;
};

export type ArenaMatchDirectorSnapshot = {
  phase: ArenaMatchPhase;
  round: number;
  matchId: string;
  phaseInstanceId: string;
  stageIndex: number;
  stageCount: number;
  stageId: string;
  stageKind: ArenaStageKind;
  qualificationCount: number;
  durationTicks: number;
  stageInstanceId: string;
  startedAtTick: number;
  stageStartedAtTick?: number | undefined;
  deadlineTick?: number | undefined;
  winnerParticipantId?: string | undefined;
};

type ArenaStageActionIdentity = {
  stageIndex: number;
  stageId: string;
  stageInstanceId: string;
};

export type ArenaMatchDirectorAction =
  | ({ type: "stage-prepared" } & ArenaStageActionIdentity)
  | ({ type: "stage-started" } & ArenaStageActionIdentity)
  | ({
      type: "stage-completed";
      reason: ArenaStageCompletionReason;
      finalStage: boolean;
      winnerParticipantId?: string | undefined;
    } & ArenaStageActionIdentity)
  | ({ type: "rematch-reset"; round: number; matchId: string } & ArenaStageActionIdentity);

export type ArenaMatchDirectorAdvanceResult = {
  snapshot: ArenaMatchDirectorSnapshot;
  actions: ArenaMatchDirectorAction[];
};

export type ArenaMatchDirectorDiagnostics = {
  transitions: number;
  invalidTicks: number;
  traceEntries: number;
  traceDrops: number;
  disposed: boolean;
};

export type ArenaMatchDirector = {
  advance(input: {
    tick: number;
    connectedHumans: number;
    entrantParticipantIds: readonly string[];
    activeParticipantIds: readonly string[];
    completedParticipantIds?: readonly string[] | undefined;
  }): ArenaMatchDirectorAdvanceResult;
  snapshot(): ArenaMatchDirectorSnapshot;
  countdownMs(fixedDeltaMs: number, tick: number): number;
  runningTimeMs(fixedDeltaMs: number, tick: number): number;
  trace(): ArenaMatchDirectorTraceEntry[];
  diagnostics(): ArenaMatchDirectorDiagnostics;
  dispose(): void;
};

const DEFAULT_TRACE_CAPACITY = 128;

export function createArenaMatchDirector(options: {
  stageRules: readonly ArenaStageRule[];
  countdownTicks: number;
  resultsTicks: number;
  traceCapacity?: number | undefined;
}): ArenaMatchDirector {
  const stageRules = [...options.stageRules];
  if (
    stageRules.length === 0 ||
    new Set(stageRules.map((rule) => rule.id)).size !== stageRules.length
  ) {
    throw new Error("Arena match director requires unique stage rules");
  }
  const countdownTicks = positiveInteger(options.countdownTicks, "countdownTicks");
  const resultsTicks = positiveInteger(options.resultsTicks, "resultsTicks");
  const traceCapacity = positiveInteger(
    options.traceCapacity ?? DEFAULT_TRACE_CAPACITY,
    "traceCapacity"
  );
  const traces: ArenaMatchDirectorTraceEntry[] = [];
  let phase: ArenaMatchPhase = "lobby";
  let round = 1;
  let matchId = matchIdentity(round);
  let stageIndex = 0;
  let stageInstanceId = stageIdentity(matchId, currentRule().id, stageIndex);
  let phaseInstance = 1;
  let startedAtTick = 0;
  let stageStartedAtTick: number | undefined;
  let deadlineTick: number | undefined;
  let winnerParticipantId: string | undefined;
  let transitionCount = 0;
  let invalidTicks = 0;
  let traceDrops = 0;
  let lastTick = 0;
  let disposed = false;

  return {
    advance(input) {
      assertActive();
      validateInput(input);
      lastTick = input.tick;
      const actions: ArenaMatchDirectorAction[] = [];
      let stageStarted = false;

      if (phase === "lobby" && input.connectedHumans > 0) {
        transition("countdown", "roster-ready", input.tick, input.tick + countdownTicks);
      } else if (phase === "countdown" && input.connectedHumans === 0) {
        transition("lobby", "roster-empty", input.tick);
      } else if (
        phase === "countdown" &&
        deadlineTick !== undefined &&
        input.tick >= deadlineTick
      ) {
        transition(
          "running",
          "countdown-complete",
          input.tick,
          input.tick + currentRule().durationTicks
        );
        stageStartedAtTick = input.tick;
        actions.push({ type: "stage-started", ...stageActionIdentity() });
        stageStarted = true;
      }

      if (phase === "running" && !stageStarted) {
        const decision = currentRule().evaluate({
          elapsedTicks: input.tick - (stageStartedAtTick ?? input.tick),
          entrantParticipantIds: input.entrantParticipantIds,
          activeParticipantIds: input.activeParticipantIds,
          completedParticipantIds: input.completedParticipantIds
        });
        if (decision.status === "complete") {
          winnerParticipantId = decision.winnerParticipantId;
          transition("results", decision.reason, input.tick, input.tick + resultsTicks);
          actions.push({
            type: "stage-completed",
            ...stageActionIdentity(),
            reason: decision.reason,
            finalStage: stageIndex === stageRules.length - 1,
            ...(decision.winnerParticipantId === undefined
              ? {}
              : { winnerParticipantId: decision.winnerParticipantId })
          });
        }
      } else if (phase === "results" && deadlineTick !== undefined && input.tick >= deadlineTick) {
        winnerParticipantId = undefined;
        stageStartedAtTick = undefined;
        if (stageIndex < stageRules.length - 1) {
          stageIndex += 1;
          stageInstanceId = stageIdentity(matchId, currentRule().id, stageIndex);
          transition(
            input.connectedHumans > 0 ? "countdown" : "lobby",
            "results-complete",
            input.tick,
            input.connectedHumans > 0 ? input.tick + countdownTicks : undefined
          );
          actions.push({ type: "stage-prepared", ...stageActionIdentity() });
        } else {
          round += 1;
          matchId = matchIdentity(round);
          stageIndex = 0;
          stageInstanceId = stageIdentity(matchId, currentRule().id, stageIndex);
          transition(
            input.connectedHumans > 0 ? "countdown" : "lobby",
            "results-complete",
            input.tick,
            input.connectedHumans > 0 ? input.tick + countdownTicks : undefined
          );
          actions.push({
            type: "rematch-reset",
            round,
            matchId,
            ...stageActionIdentity()
          });
        }
      }

      return { snapshot: captureSnapshot(), actions };
    },
    snapshot() {
      assertActive();
      return captureSnapshot();
    },
    countdownMs(fixedDeltaMs, tick) {
      assertActive();
      return phase === "countdown" && deadlineTick !== undefined
        ? Math.max(0, deadlineTick - tick) * fixedDeltaMs
        : 0;
    },
    runningTimeMs(fixedDeltaMs, tick) {
      assertActive();
      return phase === "running" || phase === "results"
        ? Math.max(0, tick - (stageStartedAtTick ?? tick)) * fixedDeltaMs
        : 0;
    },
    trace() {
      assertActive();
      return structuredClone(traces);
    },
    diagnostics() {
      return {
        transitions: transitionCount,
        invalidTicks,
        traceEntries: traces.length,
        traceDrops,
        disposed
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      traces.length = 0;
      for (const stageRule of stageRules) stageRule.dispose();
    }
  };

  function currentRule(): ArenaStageRule {
    return stageRules[stageIndex]!;
  }

  function stageActionIdentity(): ArenaStageActionIdentity {
    return { stageIndex, stageId: currentRule().id, stageInstanceId };
  }

  function transition(
    to: ArenaMatchPhase,
    reason: ArenaMatchDirectorTransitionReason,
    tick: number,
    nextDeadlineTick?: number
  ): void {
    if (phase === to) return;
    const from = phase;
    phase = to;
    startedAtTick = tick;
    deadlineTick = nextDeadlineTick;
    phaseInstance += 1;
    transitionCount += 1;
    traces.push({
      sequence: transitionCount,
      from,
      to,
      reason,
      tick,
      phaseInstanceId: `${matchId}.phase.${phaseInstance}`,
      stageInstanceId
    });
    while (traces.length > traceCapacity) {
      traces.shift();
      traceDrops += 1;
    }
  }

  function validateInput(input: {
    tick: number;
    connectedHumans: number;
    entrantParticipantIds: readonly string[];
    activeParticipantIds: readonly string[];
  }): void {
    if (
      !Number.isSafeInteger(input.tick) ||
      input.tick < lastTick ||
      !Number.isSafeInteger(input.connectedHumans) ||
      input.connectedHumans < 0
    ) {
      invalidTicks += 1;
      throw new Error("Arena match director received an invalid tick");
    }
  }

  function captureSnapshot(): ArenaMatchDirectorSnapshot {
    const rule = currentRule();
    return {
      phase,
      round,
      matchId,
      phaseInstanceId: `${matchId}.phase.${phaseInstance}`,
      stageIndex,
      stageCount: stageRules.length,
      stageId: rule.id,
      stageKind: rule.kind,
      qualificationCount: rule.qualificationCount,
      durationTicks: rule.durationTicks,
      stageInstanceId,
      startedAtTick,
      ...(stageStartedAtTick === undefined ? {} : { stageStartedAtTick }),
      ...(deadlineTick === undefined ? {} : { deadlineTick }),
      ...(winnerParticipantId === undefined ? {} : { winnerParticipantId })
    };
  }

  function assertActive(): void {
    if (disposed) throw new Error("Arena match director is disposed");
  }
}

function matchIdentity(round: number): string {
  return `match.${round}`;
}

function stageIdentity(matchId: string, stageId: string, stageIndex: number): string {
  return `${matchId}:${stageId}:${stageIndex + 1}`;
}

function positiveInteger(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Arena match director ${path} must be a positive integer`);
  }
  return value;
}
