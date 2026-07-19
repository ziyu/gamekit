import type {
  AudioEmitterId,
  AudioOwnerId,
  DialogueHandleId,
  DialogueLineId,
  SpeakerId
} from "../contracts/identifiers";
import type { FadeOptions } from "../contracts/lifecycle";
import type { AudioTransform } from "../spatial/spatial-types";
import type { DialogueInterruptPolicy } from "./dialogue-line-definition";
import type { DialogueItemState, DialogueState } from "./dialogue-state";

export type DialoguePlayOptions = {
  speakerId?: SpeakerId | undefined;
  ownerId?: AudioOwnerId | undefined;
  emitterId?: AudioEmitterId | undefined;
  transform?: AudioTransform | undefined;
  priority?: number | undefined;
  interrupt?: DialogueInterruptPolicy | undefined;
  volume?: number | undefined;
  fadeInMs?: number | undefined;
};

export type DialogueQueueOptions = Omit<DialoguePlayOptions, "interrupt">;

export interface DialogueHandle {
  readonly id: DialogueHandleId;
  getState(): DialogueItemState | undefined;
  cancel(options?: FadeOptions): boolean;
}

export interface DialoguePlayer {
  play(lineId: DialogueLineId, options?: DialoguePlayOptions): DialogueHandle;
  enqueue(lineId: DialogueLineId, options?: DialogueQueueOptions): DialogueHandle;
  skipCurrent(options?: FadeOptions): boolean;
  stopSpeaker(speakerId: SpeakerId, options?: FadeOptions): number;
  getState(): DialogueState;
}
