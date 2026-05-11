import type { InputSourceAdapter } from "@gamekit/input-core";
import {
  normalizePhaserKeyboardEvent,
  normalizePhaserPointerEvent,
  normalizePhaserWheelEvent
} from "./normalizers";
import type { PhaserInputAdapterOptions } from "./types";

export function createPhaserInputAdapter(options: PhaserInputAdapterOptions): InputSourceAdapter {
  let started = false;
  let sequence = 0;

  const clock = options.clock ?? (() => performance.now());
  const source = options.source ?? "input.phaser";

  const keydown = (event: unknown) => {
    options.onInput(
      normalizePhaserKeyboardEvent({
        id: nextId(source, ++sequence),
        event: event as any,
        type: "keydown",
        timestamp: clock(),
        source,
        originalEvent: event
      })
    );
  };
  const keyup = (event: unknown) => {
    options.onInput(
      normalizePhaserKeyboardEvent({
        id: nextId(source, ++sequence),
        event: event as any,
        type: "keyup",
        timestamp: clock(),
        source,
        originalEvent: event
      })
    );
  };
  const pointer = (type: "pointerdown" | "pointerup" | "pointermove") => {
    return (event: unknown) => {
      options.onInput(
        normalizePhaserPointerEvent({
          id: nextId(source, ++sequence),
          event: event as any,
          type,
          timestamp: clock(),
          source,
          originalEvent: event
        })
      );
    };
  };
  const wheel = (event: unknown) => {
    options.onInput(
      normalizePhaserWheelEvent({
        id: nextId(source, ++sequence),
        event: event as any,
        timestamp: clock(),
        source,
        originalEvent: event
      })
    );
  };
  const pointerdown = pointer("pointerdown");
  const pointerup = pointer("pointerup");
  const pointermove = pointer("pointermove");

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      options.driver.on("keydown", keydown);
      options.driver.on("keyup", keyup);
      options.driver.on("pointerdown", pointerdown);
      options.driver.on("pointerup", pointerup);
      options.driver.on("pointermove", pointermove);
      options.driver.on("wheel", wheel);
    },
    stop() {
      if (!started) {
        return;
      }

      started = false;
      options.driver.off("keydown", keydown);
      options.driver.off("keyup", keyup);
      options.driver.off("pointerdown", pointerdown);
      options.driver.off("pointerup", pointerup);
      options.driver.off("pointermove", pointermove);
      options.driver.off("wheel", wheel);
    },
    destroy() {
      this.stop();
    }
  };
}

function nextId(source: string, sequence: number): string {
  return `${source}:${sequence}`;
}
