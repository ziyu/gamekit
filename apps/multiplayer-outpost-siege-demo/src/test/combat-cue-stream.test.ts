import { describe, expect, it } from "vitest";

import { createOutpostCombatCueStream } from "../gameplay";
import { createOutpostClientCombatPresentation } from "../presentation";

describe("Outpost bounded combat cues", () => {
  it("retains only the configured authority history and returns defensive snapshots", () => {
    const stream = createOutpostCombatCueStream(2);
    stream.append({ kind: "miss", at: 10, position: { x: 1, y: 2 } });
    stream.append({ kind: "world-impact", at: 20, position: { x: 3, y: 4 } });
    stream.append({ kind: "health-hit", at: 30, amount: 12 });

    const snapshot = stream.snapshot();
    expect(snapshot).toMatchObject({
      cueWatermark: 3,
      cues: [
        { sequence: 2, kind: "world-impact" },
        { sequence: 3, kind: "health-hit" }
      ]
    });

    snapshot.cues[0]!.position!.x = 999;
    expect(stream.snapshot().cues[0]!.position).toEqual({ x: 3, y: 4 });
  });

  it("baselines history, consumes increments once, and diagnoses gaps and resets", () => {
    const presentation = createOutpostClientCombatPresentation({ cueHistoryLimit: 2 });
    presentation.update({
      active: true,
      cueWatermark: 2,
      cues: [
        { sequence: 1, kind: "miss", at: 10 },
        { sequence: 2, kind: "world-impact", at: 20 }
      ]
    });
    expect(presentation.snapshot()).toMatchObject({
      cueWatermark: 0,
      authorityCueWatermark: 2,
      consumedCues: 0
    });

    const nextCues = [
      { sequence: 4, kind: "shield-hit" as const, at: 40 },
      { sequence: 4, kind: "shield-hit" as const, at: 40 },
      { sequence: 5, kind: "health-hit" as const, at: 50 }
    ];
    presentation.update({ active: true, cueWatermark: 5, cues: nextCues });
    presentation.update({ active: true, cueWatermark: 5, cues: nextCues });

    expect(presentation.cuesAfter(0).map((cue) => cue.authoritySequence)).toEqual([4, 5]);
    expect(presentation.snapshot()).toMatchObject({
      cueWatermark: 2,
      authorityCueWatermark: 5,
      retainedCues: 2,
      consumedCues: 2,
      droppedCues: 1,
      authorityResets: 0
    });

    presentation.update({ active: true, cueWatermark: 3, cues: [] });
    presentation.update({
      active: true,
      cueWatermark: 4,
      cues: [{ sequence: 4, kind: "kill-confirmed", at: 60 }]
    });
    expect(presentation.cuesAfter(0).map((cue) => cue.authoritySequence)).toEqual([5, 4]);
    expect(presentation.snapshot()).toMatchObject({
      cueWatermark: 3,
      authorityCueWatermark: 4,
      retainedCues: 2,
      consumedCues: 3,
      droppedCues: 1,
      authorityResets: 1
    });
  });
});
