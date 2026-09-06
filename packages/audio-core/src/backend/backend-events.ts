import type { PlaybackInstanceId } from "../contracts/identifiers";

export type AudioBackendEvent =
  | {
      type: "ended";
      instanceId: PlaybackInstanceId;
      reason: "completed" | "stopped" | "failed";
    }
  | {
      type: "marker";
      instanceId: PlaybackInstanceId;
      markerId: string;
      positionMs: number;
    };
