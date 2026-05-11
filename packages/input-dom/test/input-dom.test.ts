import { describe, expect, it } from "vitest";
import { createDomInputAdapter, normalizeDomKeyboardEvent, normalizeDomWheelEvent } from "../src";

describe("DOM input normalizers", () => {
  it("normalizes keyboard events", () => {
    expect(
      normalizeDomKeyboardEvent({
        id: "k1",
        event: {
          code: "KeyW",
          shiftKey: true
        },
        type: "keydown",
        timestamp: 10,
        source: "test"
      })
    ).toMatchObject({
      id: "k1",
      device: "keyboard",
      phase: "pressed",
      code: "KeyW",
      modifiers: { shift: true },
      source: "test"
    });
  });

  it("normalizes wheel events", () => {
    expect(
      normalizeDomWheelEvent({
        id: "w1",
        event: { deltaY: -100, clientX: 12, clientY: 20 },
        timestamp: 12
      })
    ).toMatchObject({
      device: "mouse",
      phase: "scrolled",
      wheelDelta: -100,
      x: 12,
      y: 20
    });
  });
});

describe("createDomInputAdapter", () => {
  it("registers and unregisters event listeners", () => {
    const target = new FakeTarget();
    const events: unknown[] = [];
    const adapter = createDomInputAdapter({
      target,
      clock: () => 100,
      onInput: (event) => events.push(event)
    });

    adapter.start();
    target.dispatch("keydown", { code: "Enter" });
    adapter.stop();
    target.dispatch("keydown", { code: "Enter" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      code: "Enter",
      timestamp: 100
    });
  });
});

class FakeTarget {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as (event: Event) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as (event: Event) => void);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }
}
