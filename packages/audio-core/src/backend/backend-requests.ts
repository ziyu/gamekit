import type { AudioParameterValue } from "../catalog/parameter-definition";
import type { PlaybackInstanceId } from "../contracts/identifiers";
import type { PlaybackInstanceState } from "../contracts/playback";
import type { AudioBusState } from "../mix/mix-types";
import type { AudioEmitterState, AudioListenerState } from "../spatial/spatial-types";

export type BackendPlaybackRequest = {
  instance: PlaybackInstanceState;
  delayMs: number;
  fadeInMs: number;
  muted: boolean;
  paused: boolean;
  listeners: AudioListenerState[];
  emitter?: AudioEmitterState | undefined;
};

export type BackendStartResult = {
  accepted: boolean;
  reason?: string | undefined;
};

export type BackendPlaybackUpdate = {
  instanceId: PlaybackInstanceId;
  state: PlaybackInstanceState;
  transitionMs: number;
  emitter?: AudioEmitterState | undefined;
};

export type AudioBackendSnapshot = {
  id: string;
  activePlaybackInstances: number;
  nativePlaybackCount: number;
  retainedCommands: number;
  unlocked: boolean;
  suspended: boolean;
  disposed?: boolean | undefined;
  capabilities: import("./backend-capabilities").AudioBackendCapabilities;
  details?: Record<string, unknown> | undefined;
};

export type BackendBusState = AudioBusState;
export type BackendGlobalParameter = { id: string; value: AudioParameterValue };
