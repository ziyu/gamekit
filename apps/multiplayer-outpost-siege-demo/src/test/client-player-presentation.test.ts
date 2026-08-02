import { describe, expect, it } from "vitest";

import type { OutpostReplicatedWeaponState } from "../domain";
import { createOutpostClientPlayerPresentation } from "../presentation";

describe("Outpost client player presentation", () => {
  it("anticipates held rifle cadence and converges accepted and rejected shots by correlation", () => {
    const presentation = createOutpostClientPlayerPresentation({
      playerId: "player.ranger-1",
      fireIntervalMs: 120
    });
    const weapon = rifle();

    presentation.update(frame(0, weapon));
    presentation.update(frame(1, weapon, { fireHeld: true, fireSequence: 1 }));
    presentation.update(frame(60, weapon, { fireHeld: true, fireSequence: 1 }));
    presentation.update(frame(121, weapon, { fireHeld: true, fireSequence: 1 }));

    expect(presentation.cuesAfter(0)).toMatchObject([
      {
        sequence: 1,
        phase: "anticipated",
        correlationId: "player.ranger-1.rifle.1",
        predictedShotSequence: 1
      },
      {
        sequence: 2,
        phase: "anticipated",
        correlationId: "player.ranger-1.rifle.2",
        predictedShotSequence: 2
      }
    ]);
    expect(presentation.snapshot()).toMatchObject({
      pendingAnticipations: 2,
      anticipatedShots: 2
    });

    const afterAcceptedShot: OutpostReplicatedWeaponState = {
      ...weapon,
      magazine: 23,
      shotSequence: 1,
      lastShotCorrelationId: "player.ranger-1.rifle.1"
    };
    presentation.update(frame(150, afterAcceptedShot));
    presentation.update(
      frame(170, {
        ...afterAcceptedShot,
        lastFeedback: {
          sequence: 1,
          kind: "rejected",
          action: "rifle",
          reason: "full-action-channel-busy",
          at: 170,
          correlationId: "player.ranger-1.rifle.2"
        }
      })
    );

    expect(presentation.cuesAfter(2)).toMatchObject([
      {
        sequence: 3,
        phase: "confirmed",
        correlationId: "player.ranger-1.rifle.1"
      },
      {
        sequence: 4,
        phase: "rejected",
        correlationId: "player.ranger-1.rifle.2",
        reason: "full-action-channel-busy"
      }
    ]);
    expect(presentation.snapshot()).toMatchObject({
      cueWatermark: 4,
      pendingAnticipations: 0,
      confirmedShots: 1,
      rejectedShots: 1
    });
  });

  it("bounds cue history and expires an anticipation that never resolves", () => {
    const presentation = createOutpostClientPlayerPresentation({
      playerId: "player.ranger-1",
      fireIntervalMs: 10,
      cueHistoryLimit: 2,
      anticipationTimeoutMs: 30
    });
    const weapon = rifle();

    presentation.update(frame(0, weapon));
    presentation.update(frame(1, weapon, { fireHeld: true, fireSequence: 1 }));
    presentation.update(frame(11, weapon, { fireHeld: true, fireSequence: 1 }));
    presentation.update(frame(31, weapon, { fireSequence: 1 }));

    expect(presentation.cuesAfter(0)).toMatchObject([
      { sequence: 3, phase: "expired", correlationId: "player.ranger-1.rifle.1" },
      {
        sequence: 4,
        phase: "expired",
        correlationId: "player.ranger-1.rifle.2",
        reason: "correlation-chain-invalidated"
      }
    ]);
    expect(presentation.snapshot()).toMatchObject({
      cueWatermark: 4,
      pendingAnticipations: 0,
      expiredShots: 2
    });
  });

  it("publishes a cloned current aim frame for renderer feedback", () => {
    const presentation = createOutpostClientPlayerPresentation({
      playerId: "player.ranger-1",
      fireIntervalMs: 120
    });
    presentation.update({
      ...frame(32, rifle()),
      aimX: 920,
      aimY: 510
    });

    const current = presentation.currentFrame();
    expect(current).toMatchObject({
      elapsed: 32,
      active: true,
      health: 100,
      aim: { x: 920, y: 510 }
    });
    current.aim.x = 0;
    expect(presentation.currentFrame().aim).toEqual({ x: 920, y: 510 });

    presentation.reset();
    expect(presentation.currentFrame()).toMatchObject({ active: false, aim: { x: 0, y: 0 } });
  });
});

function rifle(): OutpostReplicatedWeaponState {
  return {
    weaponId: "weapon.outpost.rifle",
    magazine: 24,
    magazineSize: 24,
    reserveAmmo: 144,
    phase: "ready",
    shotSequence: 0
  };
}

function frame(
  elapsed: number,
  weapon: OutpostReplicatedWeaponState,
  input: { fireHeld?: boolean; fireSequence?: number } = {}
) {
  return {
    elapsed,
    active: true,
    health: 100,
    fireHeld: input.fireHeld ?? false,
    fireSequence: input.fireSequence ?? 0,
    aimX: 900,
    aimY: 500,
    weapon
  };
}
