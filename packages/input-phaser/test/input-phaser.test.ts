import { describe, expect, it } from "vitest";
import {
  createPhaserInputAdapter,
  normalizePhaserKeyboardEvent,
  normalizePhaserPointerEvent
} from "../src";

describe("Phaser input normalizers", () => {
  it("normalizes keyboard events without exposing Phaser types", () => {
    expect(
      normalizePhaserKeyboardEvent({
        id: "p1",
        event: { code: "Space", event: { metaKey: true } },
        type: "keydown",
        timestamp: 20
      })
    ).toMatchObject({
      device: "keyboard",
      phase: "pressed",
      code: "Space",
      modifiers: { meta: true }
    });
  });

  it("normalizes pointer movement", () => {
    expect(
      normalizePhaserPointerEvent({
        id: "p2",
        event: { id: 7, x: 20, y: 30, prevPosition: { x: 15, y: 28 } },
        type: "pointermove",
        timestamp: 21
      })
    ).toMatchObject({
      device: "mouse",
      phase: "moved",
      pointerId: "7",
      x: 20,
      y: 30,
      dx: 5,
      dy: 2
    });
  });
});

describe("createPhaserInputAdapter", () => {
  it("bridges fake Phaser driver events", () => {
    const driver = new FakePhaserInputDriver();
    const events: unknown[] = [];
    const adapter = createPhaserInputAdapter({
      driver,
      clock: () => 42,
      onInput: (event) => events.push(event)
    });

    adapter.start();
    driver.emit("keydown", { code: "KeyA" });
    adapter.stop();
    driver.emit("keydown", { code: "KeyA" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      code: "KeyA",
      timestamp: 42
    });
  });
});

class FakePhaserInputDriver {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(eventName: string, listener: (...args: unknown[]) => void): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(listener);
  }

  off(eventName: string, listener: (...args: unknown[]) => void): void {
    this.listeners.get(eventName)?.delete(listener);
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(...args);
    }
  }
}
