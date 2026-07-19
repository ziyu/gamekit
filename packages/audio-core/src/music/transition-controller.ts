import type { MusicTransition } from "./music-definition";

export type ResolvedMusicTransition = {
  delayMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  durationMs: number;
};

export function resolveMusicTransition(transition: MusicTransition): ResolvedMusicTransition {
  switch (transition.type) {
    case "cut":
      return { delayMs: 0, fadeInMs: 0, fadeOutMs: 0, durationMs: 0 };
    case "crossfade":
      return {
        delayMs: 0,
        fadeInMs: transition.durationMs,
        fadeOutMs: transition.durationMs,
        durationMs: transition.durationMs
      };
    case "fade": {
      const fadeInMs = transition.fadeInMs ?? transition.fadeOutMs;
      return {
        delayMs: transition.fadeOutMs,
        fadeInMs,
        fadeOutMs: transition.fadeOutMs,
        durationMs: transition.fadeOutMs + fadeInMs
      };
    }
  }
}
