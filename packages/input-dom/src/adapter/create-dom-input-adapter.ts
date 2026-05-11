import type { InputSourceAdapter } from "@gamekit/input-core";
import {
  normalizeDomKeyboardEvent,
  normalizeDomPointerEvent,
  normalizeDomWheelEvent
} from "./normalizers";
import type { DomInputAdapterOptions } from "./types";

export function createDomInputAdapter(options: DomInputAdapterOptions): InputSourceAdapter {
  let started = false;
  let sequence = 0;

  const clock = options.clock ?? (() => performance.now());
  const source = options.source ?? "input.dom";

  const keydown = (event: Event) => {
    options.onInput(
      normalizeDomKeyboardEvent({
        id: nextId(source, ++sequence),
        event: event as KeyboardEvent,
        type: "keydown",
        timestamp: clock(),
        source,
        originalEvent: event
      })
    );
  };
  const keyup = (event: Event) => {
    options.onInput(
      normalizeDomKeyboardEvent({
        id: nextId(source, ++sequence),
        event: event as KeyboardEvent,
        type: "keyup",
        timestamp: clock(),
        source,
        originalEvent: event
      })
    );
  };
  const pointer = (type: "pointerdown" | "pointerup" | "pointermove" | "pointercancel") => {
    return (event: Event) => {
      options.onInput(
        normalizeDomPointerEvent({
          id: nextId(source, ++sequence),
          event: event as PointerEvent,
          type,
          timestamp: clock(),
          source,
          originalEvent: event
        })
      );
    };
  };
  const wheel = (event: Event) => {
    options.onInput(
      normalizeDomWheelEvent({
        id: nextId(source, ++sequence),
        event: event as WheelEvent,
        timestamp: clock(),
        source,
        originalEvent: event
      })
    );
  };
  const pointerdown = pointer("pointerdown");
  const pointerup = pointer("pointerup");
  const pointermove = pointer("pointermove");
  const pointercancel = pointer("pointercancel");

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      options.target.addEventListener("keydown", keydown);
      options.target.addEventListener("keyup", keyup);
      options.target.addEventListener("pointerdown", pointerdown);
      options.target.addEventListener("pointerup", pointerup);
      options.target.addEventListener("pointermove", pointermove);
      options.target.addEventListener("pointercancel", pointercancel);
      options.target.addEventListener("wheel", wheel);
    },
    stop() {
      if (!started) {
        return;
      }

      started = false;
      options.target.removeEventListener("keydown", keydown);
      options.target.removeEventListener("keyup", keyup);
      options.target.removeEventListener("pointerdown", pointerdown);
      options.target.removeEventListener("pointerup", pointerup);
      options.target.removeEventListener("pointermove", pointermove);
      options.target.removeEventListener("pointercancel", pointercancel);
      options.target.removeEventListener("wheel", wheel);
    },
    destroy() {
      this.stop();
    }
  };
}

function nextId(source: string, sequence: number): string {
  return `${source}:${sequence}`;
}
