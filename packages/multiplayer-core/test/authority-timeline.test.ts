import { describe, expect, it } from "vitest";
import { createMultiplayerAuthorityTimeline } from "../src";

describe("Multiplayer authority timeline", () => {
  it("extrapolates authority time and prevents delayed snapshots from rewinding it", () => {
    const timeline = createMultiplayerAuthorityTimeline({ stepMs: 50 });
    expect(timeline.sync(1_000, 100)).toMatchObject({
      authorityTime: 1_000,
      authorityTick: 20,
      preventedRewind: false
    });
    expect(timeline.time(150)).toBe(1_050);
    expect(timeline.tick(150)).toBe(21);

    expect(timeline.sync(1_020, 150)).toMatchObject({
      authorityTime: 1_050,
      authorityTick: 21,
      preventedRewind: true
    });
    expect(timeline.time(175)).toBe(1_075);
    expect(timeline.diagnostics()).toMatchObject({
      anchored: true,
      preventedRewinds: 1,
      forwardCorrections: 0
    });
  });

  it("accepts forward authority corrections and resets its anchor", () => {
    const timeline = createMultiplayerAuthorityTimeline({ stepMs: 20 });
    timeline.sync(100, 0);
    expect(timeline.sync(180, 50)).toMatchObject({
      authorityTime: 180,
      authorityTick: 9,
      advanced: true
    });
    timeline.reset();
    expect(timeline.time(500)).toBe(0);
    expect(timeline.diagnostics()).toMatchObject({
      anchored: false,
      forwardCorrections: 1,
      resets: 1
    });
  });
});
