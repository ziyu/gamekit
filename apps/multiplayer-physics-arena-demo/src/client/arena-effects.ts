import {
  createMultiplayerSpeculativeEffectJournal,
  type MultiplayerSpeculativeEffectJournalDiagnostics
} from "@gamekit/multiplayer-core";
import type { PhysicsPredictionIslandContact } from "@gamekit/physics-core";

import type { ArenaAuthorityEffectCue, ArenaSnapshot } from "../shared/protocol";

type ArenaPredictedEffect =
  | {
      kind: "jump";
      memberId: string;
      inputSequence: number;
    }
  | {
      kind: "contact";
      pair: string;
      contactKind: "contact" | "trigger";
    };

export type ArenaClientEffectDiagnostics = {
  presentation: {
    anticipated: number;
    confirmed: number;
    cancelled: number;
    replaced: number;
  };
  journal: MultiplayerSpeculativeEffectJournalDiagnostics;
};

export type ArenaEffectPresentationEvent = {
  effectId: string;
  kind: ArenaPredictedEffect["kind"];
  phase: "anticipate" | "confirm" | "cancel" | "replace";
  tick: number;
};

export type ArenaClientEffectController = {
  anticipateJump(input: { memberId: string; inputSequence: number; predictionTick: number }): void;
  anticipateContacts(
    contacts: readonly PhysicsPredictionIslandContact[],
    localMemberId: string | undefined
  ): void;
  reconcile(snapshot: ArenaSnapshot, peerId: string): void;
  diagnostics(): ArenaClientEffectDiagnostics;
  dispose(): void;
};

const CONTACT_CONFIRMATION_TOLERANCE_TICKS = 30;

/**
 * Keeps predicted presentation reversible and replay-safe. Authority facts remain in snapshots;
 * this controller only deduplicates and settles client-side anticipation.
 */
export function createArenaClientEffectController(
  initialRound = 1,
  onPresentation?: (event: ArenaEffectPresentationEvent) => void
): ArenaClientEffectController {
  const presentation = { anticipated: 0, confirmed: 0, cancelled: 0, replaced: 0 };
  const consumedAuthorityCues = new Set<string>();
  const journal = createMultiplayerSpeculativeEffectJournal<
    ArenaPredictedEffect,
    ArenaAuthorityEffectCue
  >({
    generation: roundGeneration(initialRound),
    maxPending: 256,
    maxResolved: 512,
    maxAgeTicks: 45,
    hooks: {
      onAnticipate(effect) {
        presentation.anticipated += 1;
        onPresentation?.({
          effectId: effect.effectId,
          kind: effect.value.kind,
          phase: "anticipate",
          tick: effect.tick
        });
      },
      onConfirm(event) {
        presentation.confirmed += 1;
        onPresentation?.({
          effectId: event.effect.effectId,
          kind: event.effect.value.kind,
          phase: "confirm",
          tick: event.tick
        });
      },
      onCancel(event) {
        presentation.cancelled += 1;
        onPresentation?.({
          effectId: event.effect.effectId,
          kind: event.effect.value.kind,
          phase: "cancel",
          tick: event.tick
        });
      },
      onReplace(event) {
        presentation.replaced += 1;
        onPresentation?.({
          effectId: event.effect.effectId,
          kind: event.effect.value.kind,
          phase: "replace",
          tick: event.tick
        });
      }
    }
  });

  return {
    anticipateJump({ memberId, inputSequence, predictionTick }) {
      journal.anticipate({
        effectId: `jump:${memberId}:${inputSequence}`,
        tick: predictionTick,
        value: { kind: "jump", memberId, inputSequence }
      });
    },
    anticipateContacts(contacts, localMemberId) {
      if (localMemberId === undefined) return;
      for (const contact of contacts) {
        if (contact.phase !== "enter" || !involvesMember(contact, localMemberId)) continue;
        const pair = contactPair(contact.colliderA, contact.colliderB);
        journal.anticipate({
          effectId: `contact:${pair}:${contact.kind}:${contact.tick}`,
          tick: contact.tick,
          value: { kind: "contact", pair, contactKind: contact.kind }
        });
      }
    },
    reconcile(snapshot, peerId) {
      const generation = roundGeneration(snapshot.frame.generation);
      if (journal.generation() !== generation) {
        journal.reset(generation);
        consumedAuthorityCues.clear();
      }
      const acknowledgedSequence = snapshot.inputAcksByPeerId[peerId] ?? 0;
      const currentCueIds = new Set(snapshot.effects.map((cue) => cue.id));
      for (const cueId of consumedAuthorityCues) {
        if (!currentCueIds.has(cueId)) consumedAuthorityCues.delete(cueId);
      }
      const availableCues = snapshot.effects.filter((cue) => !consumedAuthorityCues.has(cue.id));
      for (const effect of journal.pending()) {
        if (effect.value.kind === "jump") {
          if (effect.value.inputSequence <= acknowledgedSequence) {
            journal.resolve({
              effectId: effect.effectId,
              generation,
              tick: snapshot.frame.tick,
              outcome: "confirm"
            });
          }
          continue;
        }
        const match = takeClosestCue(availableCues, effect.value, effect.tick);
        if (match !== undefined) {
          consumedAuthorityCues.add(match.id);
          journal.resolve({
            effectId: effect.effectId,
            generation,
            tick: match.tick,
            outcome: "confirm",
            authority: match
          });
        }
      }
      journal.expire(snapshot.frame.tick);
    },
    diagnostics() {
      return {
        presentation: { ...presentation },
        journal: journal.diagnostics()
      };
    },
    dispose() {
      journal.dispose();
      consumedAuthorityCues.clear();
    }
  };
}

function takeClosestCue(
  cues: ArenaAuthorityEffectCue[],
  predicted: Extract<ArenaPredictedEffect, { kind: "contact" }>,
  predictedTick: number
): ArenaAuthorityEffectCue | undefined {
  let matchIndex = -1;
  let smallestDistance = Number.POSITIVE_INFINITY;
  for (const [index, cue] of cues.entries()) {
    if (cue.contactKind !== predicted.contactKind) continue;
    if (contactPair(cue.colliderA, cue.colliderB) !== predicted.pair) continue;
    const distance = Math.abs(cue.tick - predictedTick);
    if (distance > CONTACT_CONFIRMATION_TOLERANCE_TICKS || distance >= smallestDistance) continue;
    matchIndex = index;
    smallestDistance = distance;
  }
  if (matchIndex < 0) return undefined;
  return cues.splice(matchIndex, 1)[0];
}

function involvesMember(contact: PhysicsPredictionIslandContact, memberId: string): boolean {
  return (
    contact.bodyA === memberId ||
    contact.bodyB === memberId ||
    contact.colliderA.startsWith(`${memberId}.`) ||
    contact.colliderB.startsWith(`${memberId}.`)
  );
}

function contactPair(colliderA: string, colliderB: string): string {
  return [colliderA, colliderB].sort().join("|");
}

function roundGeneration(generation: string | number): string {
  return typeof generation === "number" ? `m${generation}.s1.r${generation}` : generation;
}
