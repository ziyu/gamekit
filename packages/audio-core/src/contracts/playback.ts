import type { AudioParameterValue } from "../catalog/parameter-definition";
import type { ResolvedAudioTrack } from "../catalog/source-definition";
import type {
  AudioBusId,
  AudioEmitterId,
  AudioOwnerId,
  AudioParameterId,
  PlaybackInstanceId
} from "./identifiers";
import type { FadeOptions } from "./lifecycle";
import type { AudioSpatialDefinition, AudioTransform } from "../spatial/spatial-types";

export type PlaybackCategory = "music" | "sfx" | "dialogue";
export type PlaybackStatus = "scheduled" | "playing" | "paused" | "stopping";

export type PlaybackBudget = {
  maxPlaybackInstances: number;
  maxNativePlaybackCount: number;
};

export type PlaybackBudgets = Partial<Record<PlaybackCategory, Partial<PlaybackBudget>>>;

export type PlaybackInstanceState = {
  id: PlaybackInstanceId;
  category: PlaybackCategory;
  sourceId: string;
  status: PlaybackStatus;
  busId: AudioBusId;
  tracks: ResolvedAudioTrack[];
  backendObject?: string | undefined;
  volume: number;
  effectiveVolume: number;
  pitch: number;
  pan: number;
  loop: boolean;
  priority: number;
  startedAt: number;
  scheduledAt: number;
  updatedAt: number;
  positionMs: number;
  ownerId?: AudioOwnerId | undefined;
  emitterId?: AudioEmitterId | undefined;
  transform?: AudioTransform | undefined;
  spatial?: AudioSpatialDefinition | undefined;
  parameters: Record<AudioParameterId, AudioParameterValue>;
  tags: string[];
};

export type PlaybackPatch = {
  volume?: number | undefined;
  pitch?: number | undefined;
  pan?: number | undefined;
  loop?: boolean | undefined;
  emitterId?: AudioEmitterId | undefined;
  transform?: AudioTransform | undefined;
};

export type PlaybackTarget = {
  instanceId?: PlaybackInstanceId | undefined;
  category?: PlaybackCategory | undefined;
  sourceId?: string | undefined;
  busId?: AudioBusId | undefined;
  ownerId?: AudioOwnerId | undefined;
  emitterId?: AudioEmitterId | undefined;
};

export interface PlaybackHandle {
  readonly id: PlaybackInstanceId;
  getState(): PlaybackInstanceState | undefined;
  pause(): boolean;
  resume(): boolean;
  seek(positionMs: number): boolean;
  set(patch: PlaybackPatch, transitionMs?: number): boolean;
  setParameter(parameterId: AudioParameterId, value: AudioParameterValue): boolean;
  stop(options?: FadeOptions): boolean;
}
