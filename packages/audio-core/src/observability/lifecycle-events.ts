import type { PlaybackInstanceId } from "../contracts/identifiers";
import type { PlaybackCategory } from "../contracts/playback";

export type GameAudioEvent = {
  sequence: number;
  timestamp: number;
  type:
    | "scheduled"
    | "started"
    | "paused"
    | "resumed"
    | "stopping"
    | "stopped"
    | "completed"
    | "failed"
    | "marker";
  instanceId: PlaybackInstanceId;
  category?: PlaybackCategory | undefined;
  sourceId?: string | undefined;
  markerId?: string | undefined;
  positionMs?: number | undefined;
};
