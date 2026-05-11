import { GameError } from "../errors/game-error";

export type ClockSnapshot = {
  elapsed: number;
  delta: number;
  ticks: number;
  running: boolean;
};

export class Clock {
  private elapsedValue = 0;
  private deltaValue = 0;
  private ticksValue = 0;
  private runningValue = false;

  start(): void {
    this.runningValue = true;
  }

  stop(): void {
    this.runningValue = false;
    this.deltaValue = 0;
  }

  reset(): void {
    this.elapsedValue = 0;
    this.deltaValue = 0;
    this.ticksValue = 0;
    this.runningValue = false;
  }

  tick(delta: number): ClockSnapshot {
    if (delta < 0) {
      throw new GameError("clock.invalid_delta", "Clock delta cannot be negative", { delta });
    }

    if (!this.runningValue) {
      this.deltaValue = 0;
      return this.snapshot();
    }

    this.deltaValue = delta;
    this.elapsedValue += delta;
    this.ticksValue += 1;
    return this.snapshot();
  }

  snapshot(): ClockSnapshot {
    return {
      elapsed: this.elapsedValue,
      delta: this.deltaValue,
      ticks: this.ticksValue,
      running: this.runningValue
    };
  }
}
