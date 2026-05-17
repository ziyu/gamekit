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

  it("normalizes optional input scope", () => {
    expect(
      normalizeDomKeyboardEvent({
        id: "k1",
        event: { code: "KeyW" },
        type: "keydown",
        timestamp: 10,
        scope: "game"
      })
    ).toMatchObject({
      scope: "game"
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

  it("resolves event scope before emitting normalized input", () => {
    const target = new FakeTarget();
    const events: unknown[] = [];
    const adapter = createDomInputAdapter({
      target,
      scope: () => "game",
      onInput: (event) => events.push(event)
    });

    adapter.start();
    target.dispatch("keydown", { code: "KeyW" });

    expect(events[0]).toMatchObject({
      code: "KeyW",
      scope: "game"
    });
  });

  it("leaves held key cadence to the input router instead of browser repeat", () => {
    const target = new FakeTarget();
    const events: unknown[] = [];
    const adapter = createDomInputAdapter({
      target,
      onInput: (event) => events.push(event)
    });

    adapter.start();
    target.dispatch("keydown", { code: "KeyW" });
    target.dispatch("keydown", { code: "KeyW", repeat: true });
    target.dispatch("keyup", { code: "KeyW" });

    expect(events).toHaveLength(2);
    expect(events.map((event) => (event as { phase: string }).phase)).toEqual([
      "pressed",
      "released"
    ]);
  });

  it("can filter native events before normalization", () => {
    const target = new FakeTarget();
    const events: unknown[] = [];
    const adapter = createDomInputAdapter({
      target,
      eventFilter: (event) => event.type !== "pointerdown",
      onInput: (event) => events.push(event)
    });

    adapter.start();
    target.dispatch("pointerdown", { type: "pointerdown", button: 0 });
    target.dispatch("keydown", { type: "keydown", code: "Enter" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ code: "Enter" });
  });

  it("can register listeners in capture phase", () => {
    const target = new FakeTarget();
    const adapter = createDomInputAdapter({
      target,
      capture: true,
      onInput: () => undefined
    });

    adapter.start();
    adapter.stop();

    expect(target.listenerOptions).toEqual([
      { type: "keydown", capture: true },
      { type: "keyup", capture: true },
      { type: "pointerdown", capture: true },
      { type: "pointerup", capture: true },
      { type: "pointermove", capture: true },
      { type: "pointercancel", capture: true },
      { type: "wheel", capture: true },
      { type: "keydown", capture: true, removed: true },
      { type: "keyup", capture: true, removed: true },
      { type: "pointerdown", capture: true, removed: true },
      { type: "pointerup", capture: true, removed: true },
      { type: "pointermove", capture: true, removed: true },
      { type: "pointercancel", capture: true, removed: true },
      { type: "wheel", capture: true, removed: true }
    ]);
  });
});

class FakeTarget {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  readonly listenerOptions: Array<{ type: string; capture?: boolean; removed?: boolean }> = [];

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listenerOptions.push({ type, capture: readCapture(options) });
    this.listeners.get(type)!.add(listener as (event: Event) => void);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean
  ): void {
    this.listenerOptions.push({ type, capture: readCapture(options), removed: true });
    this.listeners.get(type)?.delete(listener as (event: Event) => void);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }
}

function readCapture(
  options: AddEventListenerOptions | EventListenerOptions | boolean | undefined
) {
  return typeof options === "boolean" ? options : options?.capture;
}
