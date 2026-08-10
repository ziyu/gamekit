import type { OutpostReplicatedCombatCue } from "../domain";

export const OUTPOST_COMBAT_CUE_HISTORY_LIMIT = 64;

export type OutpostCombatCueDraft = Omit<OutpostReplicatedCombatCue, "sequence">;

export type OutpostCombatCueStreamSnapshot = {
  cueWatermark: number;
  cues: OutpostReplicatedCombatCue[];
};

export type OutpostCombatCueStream = {
  append(cue: OutpostCombatCueDraft): OutpostReplicatedCombatCue;
  snapshot(): OutpostCombatCueStreamSnapshot;
  clear(): void;
};

export function createOutpostCombatCueStream(
  historyLimit = OUTPOST_COMBAT_CUE_HISTORY_LIMIT
): OutpostCombatCueStream {
  if (!Number.isSafeInteger(historyLimit) || historyLimit <= 0) {
    throw new Error("Outpost combat cue history limit must be a positive safe integer.");
  }
  const cues: OutpostReplicatedCombatCue[] = [];
  let cueWatermark = 0;

  return {
    append(draft) {
      cueWatermark += 1;
      const cue = cloneCombatCue({ sequence: cueWatermark, ...draft });
      cues.push(cue);
      if (cues.length > historyLimit) {
        cues.splice(0, cues.length - historyLimit);
      }
      return cloneCombatCue(cue);
    },
    snapshot() {
      return {
        cueWatermark,
        cues: cues.map(cloneCombatCue)
      };
    },
    clear() {
      cueWatermark = 0;
      cues.length = 0;
    }
  };
}

export function cloneCombatCue(cue: OutpostReplicatedCombatCue): OutpostReplicatedCombatCue {
  return {
    ...cue,
    ...(cue.position === undefined ? {} : { position: { ...cue.position } }),
    ...(cue.normal === undefined ? {} : { normal: { ...cue.normal } }),
    ...(cue.direction === undefined ? {} : { direction: { ...cue.direction } })
  };
}
