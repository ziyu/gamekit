import type {
  DialogueHandleId,
  DialogueLineId,
  PlaybackInstanceId,
  SpeakerId
} from "../contracts/identifiers";

export type DialogueItemStatus =
  | "queued"
  | "playing"
  | "completed"
  | "skipped"
  | "stopped"
  | "rejected";

export type DialogueItemState = {
  id: DialogueHandleId;
  lineId: DialogueLineId;
  speakerId?: SpeakerId | undefined;
  subtitleKey?: string | undefined;
  status: DialogueItemStatus;
  priority: number;
  queuedAt: number;
  startedAt?: number | undefined;
  playbackInstanceId?: PlaybackInstanceId | undefined;
};

export type DialogueState = {
  current?: DialogueItemState | undefined;
  queue: DialogueItemState[];
};
