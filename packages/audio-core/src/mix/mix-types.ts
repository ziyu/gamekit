import type { AudioBusId, AudioOwnerId, AudioParameterId } from "../contracts/identifiers";
import type { AudioParameterValue } from "../catalog/parameter-definition";

export type AudioBusDefinition = {
  id: AudioBusId;
  parentId?: AudioBusId | undefined;
  volume?: number | undefined;
  muted?: boolean | undefined;
  paused?: boolean | undefined;
  maxPlaybackInstances?: number | undefined;
};

export type AudioBusState = {
  id: AudioBusId;
  parentId?: AudioBusId | undefined;
  volume: number;
  targetVolume: number;
  muted: boolean;
  paused: boolean;
  effectiveVolume: number;
  effectiveMuted: boolean;
  effectivePaused: boolean;
  maxPlaybackInstances?: number | undefined;
};

export type AudioMixBusOverride = {
  busId: AudioBusId;
  volume?: number | undefined;
  muted?: boolean | undefined;
  paused?: boolean | undefined;
};

export type AudioMixSnapshotDefinition = {
  id: string;
  priority?: number | undefined;
  buses: AudioMixBusOverride[];
};

export type AudioMixActivationState = {
  activationId: string;
  snapshotId: string;
  ownerId?: AudioOwnerId | undefined;
  priority: number;
  weight: number;
  targetWeight: number;
};

export type AudioMixerSnapshot = {
  buses: AudioBusState[];
  activations: AudioMixActivationState[];
  globalParameters: Record<AudioParameterId, AudioParameterValue>;
};

export interface AudioMixer {
  setBus(
    busId: AudioBusId,
    state: {
      volume?: number | undefined;
      muted?: boolean | undefined;
      paused?: boolean | undefined;
    },
    transitionMs?: number
  ): void;
  activateSnapshot(
    snapshotId: string,
    options?: {
      activationId?: string | undefined;
      ownerId?: AudioOwnerId | undefined;
      weight?: number | undefined;
      fadeMs?: number | undefined;
    }
  ): string;
  deactivateSnapshot(activationId: string, fadeMs?: number): boolean;
  releaseOwner(ownerId: AudioOwnerId, fadeMs?: number): number;
  setGlobalParameter(parameterId: AudioParameterId, value: AudioParameterValue): void;
  getBus(busId: AudioBusId): AudioBusState | undefined;
  snapshot(): AudioMixerSnapshot;
}
