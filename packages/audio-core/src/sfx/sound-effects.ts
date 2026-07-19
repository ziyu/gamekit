import type { AudioParameterValue } from "../catalog/parameter-definition";
import type {
  AudioEmitterId,
  AudioOwnerId,
  PlaybackInstanceId,
  SfxEventId
} from "../contracts/identifiers";
import type { FadeOptions } from "../contracts/lifecycle";
import type { PlaybackHandle } from "../contracts/playback";
import type { AudioTransform } from "../spatial/spatial-types";

export type SfxPlayOptions = {
  instanceId?: PlaybackInstanceId | undefined;
  bus?: string | undefined;
  emitterId?: AudioEmitterId | undefined;
  transform?: AudioTransform | undefined;
  ownerId?: AudioOwnerId | undefined;
  volume?: number | undefined;
  pitch?: number | undefined;
  pan?: number | undefined;
  loop?: boolean | undefined;
  priority?: number | undefined;
  delayMs?: number | undefined;
  startOffsetMs?: number | undefined;
  fadeInMs?: number | undefined;
  parameters?: Record<string, AudioParameterValue> | undefined;
  dedupeKey?: string | undefined;
};

export type SfxPlayRejectionReason =
  | "concurrency"
  | "distance-culled"
  | "backend-rejected"
  | "duplicate-instance-id"
  | "no-playable-layer";

export type SfxPlayResult =
  | {
      status: "playing" | "scheduled";
      handle: PlaybackHandle;
      stoppedInstanceIds: PlaybackInstanceId[];
    }
  | { status: "rejected"; reason: SfxPlayRejectionReason }
  | { status: "deduplicated"; handle?: PlaybackHandle | undefined };

export type SoundEffectsSnapshot = {
  active: number;
  rejected: number;
  deduplicated: number;
  distanceCulled: number;
  stoppedForConcurrency: number;
};

export interface SoundEffects {
  play(eventId: SfxEventId, options?: SfxPlayOptions): SfxPlayResult;
  stop(handle: PlaybackHandle, options?: FadeOptions): boolean;
  stopOwner(ownerId: AudioOwnerId, options?: FadeOptions): number;
  stopEmitter(emitterId: AudioEmitterId, options?: FadeOptions): number;
  snapshot(): SoundEffectsSnapshot;
}
