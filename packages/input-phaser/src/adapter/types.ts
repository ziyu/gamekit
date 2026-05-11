import type { NormalizedInputEvent } from "@gamekit/input-core";

export type PhaserInputDriver = {
  on(eventName: string, listener: (...args: unknown[]) => void): void;
  off(eventName: string, listener: (...args: unknown[]) => void): void;
};

export type PhaserInputAdapterOptions = {
  driver: PhaserInputDriver;
  onInput: (event: NormalizedInputEvent) => void;
  source?: string;
  clock?: () => number;
};
