import type { MusicTrackId } from "../contracts/identifiers";
import type { FadeOptions } from "../contracts/lifecycle";
import type { MusicTransition } from "./music-definition";
import type { MusicState } from "./music-state";

export type MusicPlayOptions = {
  volume?: number | undefined;
  startOffsetMs?: number | undefined;
  fadeInMs?: number | undefined;
};

export interface MusicPlayer {
  play(trackId: MusicTrackId, options?: MusicPlayOptions): MusicState;
  transitionTo(trackId: MusicTrackId, transition?: MusicTransition): MusicState;
  setIntensity(value: number, transitionMs?: number): void;
  pause(): void;
  resume(): void;
  seek(positionMs: number): void;
  stop(options?: FadeOptions): void;
  getState(): MusicState;
}
