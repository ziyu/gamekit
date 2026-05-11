import type { NormalizedInputEvent } from "@gamekit/input-core";

export type DomInputTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type DomInputAdapterOptions = {
  target: DomInputTarget;
  onInput: (event: NormalizedInputEvent) => void;
  source?: string;
  clock?: () => number;
};
