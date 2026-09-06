import type { AudioEmitterId, AudioListenerId } from "../contracts/identifiers";

export type AudioPoint = { x: number; y: number; z?: number | undefined };

export type AudioTransform = {
  position: AudioPoint;
  forward?: AudioPoint | undefined;
  up?: AudioPoint | undefined;
};

export type AudioListenerState = {
  id: AudioListenerId;
  transform: AudioTransform;
  weight: number;
};

export type AudioEmitterState = {
  id: AudioEmitterId;
  transform: AudioTransform;
  velocity?: AudioPoint | undefined;
  active: boolean;
};

export type AudioRolloffModel = "linear" | "inverse" | "exponential";

export type AudioSpatialDefinition = {
  minDistance?: number | undefined;
  maxDistance: number;
  rolloff?: AudioRolloffModel | undefined;
  rolloffFactor?: number | undefined;
  distanceCulling?: boolean | undefined;
};

export type RemoveEmitterOptions = {
  stopPlayback?: boolean | undefined;
  fadeMs?: number | undefined;
};

export interface SpatialAudio {
  setListener(listener: Omit<AudioListenerState, "weight"> & { weight?: number | undefined }): void;
  removeListener(listenerId: AudioListenerId): boolean;
  setEmitter(emitter: Omit<AudioEmitterState, "active"> & { active?: boolean | undefined }): void;
  setEmitters(
    emitters: ReadonlyArray<Omit<AudioEmitterState, "active"> & { active?: boolean | undefined }>
  ): number;
  removeEmitter(emitterId: AudioEmitterId, options?: RemoveEmitterOptions): boolean;
  listeners(): AudioListenerState[];
  emitters(): AudioEmitterState[];
}
