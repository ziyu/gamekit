import { describe, expect, it } from "vitest";
import { Clock, GameError } from "../src/index";

describe("Clock", () => {
  it("restores saved elapsed time and ticks", () => {
    const clock = new Clock();
    clock.start();
    clock.tick(16);

    clock.restore({ elapsed: 1587 * 16, ticks: 1587, running: true });

    expect(clock.snapshot()).toMatchObject({
      elapsed: 25392,
      ticks: 1587,
      delta: 0,
      running: true
    });

    clock.tick(16);
    expect(clock.snapshot().ticks).toBe(1588);
  });

  it("rejects invalid restored values", () => {
    const clock = new Clock();

    expect(() => clock.restore({ elapsed: -1, ticks: 0 })).toThrow(GameError);
    expect(() => clock.restore({ elapsed: 0, ticks: -1 })).toThrow(GameError);
    expect(() => clock.restore({ elapsed: 0, ticks: 0, delta: -1 })).toThrow(GameError);
  });
});
