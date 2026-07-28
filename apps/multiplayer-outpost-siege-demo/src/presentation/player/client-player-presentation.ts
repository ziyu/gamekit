import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";

import type { OutpostReplicatedWeaponState } from "../../domain";

export type OutpostPlayerPresentationCue = {
  sequence: number;
  semanticId: "outpost.player.rifle-shot";
  phase: "anticipated" | "confirmed" | "rejected" | "expired";
  sourcePlayerId: string;
  correlationId: string;
  predictedShotSequence: number;
  at: number;
  reason?: string | undefined;
};

export type OutpostPlayerPresentationSnapshot = {
  cueWatermark: number;
  pendingAnticipations: number;
  anticipatedShots: number;
  confirmedShots: number;
  rejectedShots: number;
  expiredShots: number;
};

export type OutpostClientPlayerPresentation = {
  update(frame: OutpostClientPlayerPresentationUpdate): void;
  cuesAfter(sequence: number): OutpostPlayerPresentationCue[];
  snapshot(): OutpostPlayerPresentationSnapshot;
  reset(): void;
};

export type OutpostClientPlayerPresentationUpdate = {
  elapsed: number;
  active: boolean;
  health: number;
  fireHeld: boolean;
  fireSequence: number;
  weapon?: OutpostReplicatedWeaponState | undefined;
};

export type CreateOutpostClientPlayerPresentationOptions = {
  playerId: string;
  fireIntervalMs: number;
  cueHistoryLimit?: number | undefined;
  anticipationTimeoutMs?: number | undefined;
  maxPendingAnticipations?: number | undefined;
};

type PendingRifleAnticipation = {
  correlationId: string;
  predictedShotSequence: number;
  anticipatedAt: number;
};

const DEFAULT_CUE_HISTORY_LIMIT = 32;
const DEFAULT_ANTICIPATION_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_PENDING_ANTICIPATIONS = 8;

export function createOutpostClientPlayerPresentation(
  options: CreateOutpostClientPlayerPresentationOptions
): OutpostClientPlayerPresentation {
  const cueHistoryLimit = positiveInteger(
    options.cueHistoryLimit,
    DEFAULT_CUE_HISTORY_LIMIT,
    "cueHistoryLimit"
  );
  const anticipationTimeoutMs = positiveNumber(
    options.anticipationTimeoutMs,
    DEFAULT_ANTICIPATION_TIMEOUT_MS,
    "anticipationTimeoutMs"
  );
  const maxPendingAnticipations = positiveInteger(
    options.maxPendingAnticipations,
    DEFAULT_MAX_PENDING_ANTICIPATIONS,
    "maxPendingAnticipations"
  );
  const fireIntervalMs = positiveNumber(options.fireIntervalMs, undefined, "fireIntervalMs");
  const cues: OutpostPlayerPresentationCue[] = [];
  const pending: PendingRifleAnticipation[] = [];
  let initialized = false;
  let cueSequence = 0;
  let lastInputFireSequence = 0;
  let lastAuthorityShotSequence = 0;
  let lastFeedbackSequence = 0;
  let nextAnticipationAt = 0;
  let queuedFireEdge = false;
  let anticipatedShots = 0;
  let confirmedShots = 0;
  let rejectedShots = 0;
  let expiredShots = 0;

  return {
    update(frame) {
      const weapon = frame.weapon;
      if (!frame.active || frame.health <= 0 || weapon === undefined) {
        clearTransientState(frame.fireSequence);
        return;
      }
      if (!initialized) {
        initialized = true;
        lastInputFireSequence = frame.fireSequence;
        lastAuthorityShotSequence = weapon.shotSequence;
        lastFeedbackSequence = weapon.lastFeedback?.sequence ?? 0;
        nextAnticipationAt = frame.elapsed;
        return;
      }

      reconcileAuthority(frame.elapsed, weapon);
      expireStaleAnticipations(frame.elapsed);

      if (frame.fireSequence !== lastInputFireSequence) {
        lastInputFireSequence = frame.fireSequence;
        queuedFireEdge = true;
      }
      if (!frame.fireHeld && !queuedFireEdge) {
        return;
      }
      if (
        frame.elapsed < nextAnticipationAt ||
        pending.length >= maxPendingAnticipations ||
        weapon.magazine <= pending.length ||
        (weapon.phase !== "ready" && weapon.phase !== "reloading")
      ) {
        return;
      }

      const predictedShotSequence = lastAuthorityShotSequence + pending.length + 1;
      const correlationId = `${options.playerId}.rifle.${predictedShotSequence}`;
      if (pending.some((candidate) => candidate.correlationId === correlationId)) {
        return;
      }
      pending.push({ correlationId, predictedShotSequence, anticipatedAt: frame.elapsed });
      queuedFireEdge = false;
      nextAnticipationAt = frame.elapsed + fireIntervalMs;
      anticipatedShots += 1;
      appendCue({
        phase: "anticipated",
        correlationId,
        predictedShotSequence,
        at: frame.elapsed
      });
    },
    cuesAfter(sequence) {
      return cues.filter((cue) => cue.sequence > sequence).map(cloneCue);
    },
    snapshot() {
      return {
        cueWatermark: cueSequence,
        pendingAnticipations: pending.length,
        anticipatedShots,
        confirmedShots,
        rejectedShots,
        expiredShots
      };
    },
    reset() {
      initialized = false;
      cueSequence = 0;
      lastInputFireSequence = 0;
      lastAuthorityShotSequence = 0;
      lastFeedbackSequence = 0;
      nextAnticipationAt = 0;
      queuedFireEdge = false;
      anticipatedShots = 0;
      confirmedShots = 0;
      rejectedShots = 0;
      expiredShots = 0;
      cues.length = 0;
      pending.length = 0;
    }
  };

  function reconcileAuthority(elapsed: number, weapon: OutpostReplicatedWeaponState): void {
    if (weapon.shotSequence < lastAuthorityShotSequence) {
      pending.length = 0;
      queuedFireEdge = false;
      lastAuthorityShotSequence = weapon.shotSequence;
    } else if (weapon.shotSequence > lastAuthorityShotSequence) {
      const correlated = weapon.lastShotCorrelationId;
      if (correlated !== undefined) {
        const index = pending.findIndex((candidate) => candidate.correlationId === correlated);
        if (index >= 0) {
          for (let count = 0; count <= index; count += 1) {
            confirmPending(0, elapsed);
          }
        }
      }
      while (pending[0] !== undefined && pending[0].predictedShotSequence <= weapon.shotSequence) {
        confirmPending(0, elapsed);
      }
      lastAuthorityShotSequence = weapon.shotSequence;
    }

    const feedback = weapon.lastFeedback;
    if (feedback === undefined || feedback.sequence <= lastFeedbackSequence) {
      return;
    }
    lastFeedbackSequence = feedback.sequence;
    if (feedback.action !== "rifle" || feedback.correlationId === undefined) {
      return;
    }
    const index = pending.findIndex(
      (candidate) => candidate.correlationId === feedback.correlationId
    );
    if (index < 0) {
      return;
    }
    const invalidated = pending.splice(index);
    const rejected = invalidated.shift();
    if (!rejected) {
      return;
    }
    rejectedShots += 1;
    appendCue({
      phase: "rejected",
      correlationId: rejected.correlationId,
      predictedShotSequence: rejected.predictedShotSequence,
      at: elapsed,
      reason: feedback.reason
    });
    for (const dependent of invalidated) {
      expiredShots += 1;
      appendCue({
        phase: "expired",
        correlationId: dependent.correlationId,
        predictedShotSequence: dependent.predictedShotSequence,
        at: elapsed,
        reason: "correlation-chain-invalidated"
      });
    }
  }

  function confirmPending(index: number, elapsed: number): void {
    const [confirmed] = pending.splice(index, 1);
    if (!confirmed) {
      return;
    }
    confirmedShots += 1;
    appendCue({
      phase: "confirmed",
      correlationId: confirmed.correlationId,
      predictedShotSequence: confirmed.predictedShotSequence,
      at: elapsed
    });
  }

  function expireStaleAnticipations(elapsed: number): void {
    const first = pending[0];
    if (first === undefined || elapsed - first.anticipatedAt < anticipationTimeoutMs) {
      return;
    }
    const invalidated = pending.splice(0);
    for (let index = 0; index < invalidated.length; index += 1) {
      const expired = invalidated[index];
      if (!expired) {
        continue;
      }
      expiredShots += 1;
      appendCue({
        phase: "expired",
        correlationId: expired.correlationId,
        predictedShotSequence: expired.predictedShotSequence,
        at: elapsed,
        reason: index === 0 ? "authority-timeout" : "correlation-chain-invalidated"
      });
    }
  }

  function appendCue(
    cue: Omit<OutpostPlayerPresentationCue, "sequence" | "semanticId" | "sourcePlayerId">
  ): void {
    cueSequence += 1;
    cues.push({
      sequence: cueSequence,
      semanticId: "outpost.player.rifle-shot",
      sourcePlayerId: options.playerId,
      ...cue
    });
    if (cues.length > cueHistoryLimit) {
      cues.splice(0, cues.length - cueHistoryLimit);
    }
  }

  function clearTransientState(fireSequence: number): void {
    initialized = false;
    lastInputFireSequence = fireSequence;
    nextAnticipationAt = 0;
    queuedFireEdge = false;
    pending.length = 0;
  }
}

export function createOutpostClientPlayerPresentationModule(options: {
  presentation: OutpostClientPlayerPresentation;
  readFrame():
    | {
        active: boolean;
        health: number;
        fireHeld: boolean;
        fireSequence: number;
        weapon?: OutpostReplicatedWeaponState | undefined;
      }
    | undefined;
}) {
  return defineGameModule<GameInstallContext>({
    id: "outpost.client.player-presentation",
    install(ctx) {
      ctx.systems.register({
        id: "outpost.client.player-presentation.update",
        update({ elapsed }) {
          const frame = options.readFrame();
          options.presentation.update({
            elapsed,
            active: frame?.active ?? false,
            health: frame?.health ?? 0,
            fireHeld: frame?.fireHeld ?? false,
            fireSequence: frame?.fireSequence ?? 0,
            ...(frame?.weapon === undefined ? {} : { weapon: frame.weapon })
          });
        }
      });
      return () => options.presentation.reset();
    }
  });
}

function cloneCue(cue: OutpostPlayerPresentationCue): OutpostPlayerPresentationCue {
  return { ...cue };
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`Outpost player presentation ${label} must be a positive integer.`);
  }
  return resolved;
}

function positiveNumber(
  value: number | undefined,
  fallback: number | undefined,
  label: string
): number {
  const resolved = value ?? fallback;
  if (resolved === undefined || !Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`Outpost player presentation ${label} must be a positive number.`);
  }
  return resolved;
}
