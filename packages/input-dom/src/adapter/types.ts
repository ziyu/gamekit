import type { InputScopeId, NormalizedInputEvent } from "@gamekit/input-core";

export type DomInputTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type DomInputScopeResolver = (event: Event) => InputScopeId | undefined;

export type DomInputAdapterOptions = {
  target: DomInputTarget;
  onInput: (event: NormalizedInputEvent) => void;
  source?: string;
  scope?: InputScopeId | DomInputScopeResolver;
  clock?: () => number;
};
