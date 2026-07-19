import type { MusicTrackId, PlaybackInstanceId } from "../contracts/identifiers";
import type { MusicTransition } from "./music-definition";

export type MusicPlaybackStatus = "stopped" | "scheduled" | "playing" | "paused";

export type MusicTransitionState = {
  fromTrackId?: MusicTrackId | undefined;
  toTrackId: MusicTrackId;
  transition: MusicTransition;
  startedAt: number;
  endsAt: number;
};

export type MusicState = {
  status: MusicPlaybackStatus;
  trackId?: MusicTrackId | undefined;
  instanceId?: PlaybackInstanceId | undefined;
  positionMs: number;
  intensity: number;
  transition?: MusicTransitionState | undefined;
};
