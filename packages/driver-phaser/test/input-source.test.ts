import { describe, expect, it } from "vitest";
import type { NormalizedInputEvent } from "@gamekit/input-core";
import {
  createPhaserDriverInputSource,
  type PhaserDriverInputRuntime
} from "../src/driver/input-source";

describe("createPhaserDriverInputSource", () => {
  it("normalizes Phaser wheel callback arguments", () => {
    const events: NormalizedInputEvent[] = [];
    const runtime = createFakeRuntime();
    const source = createPhaserDriverInputSource({
      runtime: () => runtime,
      onInput(event) {
        events.push(event);
      },
      source: "test.phaser.input",
      clock: () => 10
    });

    source.start();
    runtime.emit("wheel", { x: 20, y: 30, pointerId: 7 }, [], 0, -120, 0, {
      type: "wheel"
    });

    expect(events).toMatchObject([
      {
        device: "mouse",
        phase: "scrolled",
        pointerId: "7",
        x: 20,
        y: 30,
        wheelDelta: -120,
        source: "test.phaser.input",
        timestamp: 10
      }
    ]);
  });
});

type Listener = (...args: unknown[]) => void;

function createFakeRuntime(): PhaserDriverInputRuntime & {
  emit(eventName: string, ...args: unknown[]): void;
} {
  const listeners = new Map<string, Set<Listener>>();

  return {
    on(eventName, listener) {
      const eventListeners = listeners.get(eventName) ?? new Set<Listener>();
      eventListeners.add(listener);
      listeners.set(eventName, eventListeners);
    },
    off(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
    emit(eventName, ...args) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }
  };
}
