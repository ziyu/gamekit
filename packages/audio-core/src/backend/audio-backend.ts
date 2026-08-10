import type { AudioParameterValue } from "../catalog/parameter-definition";
import type { AudioParameterId, PlaybackInstanceId } from "../contracts/identifiers";
import type { AudioBusState } from "../mix/mix-types";
import type { AudioEmitterState, AudioListenerState } from "../spatial/spatial-types";
import type { AudioBackendCapabilities } from "./backend-capabilities";
import type { AudioBackendEvent } from "./backend-events";
import type {
  AudioBackendSnapshot,
  BackendPlaybackRequest,
  BackendPlaybackUpdate,
  BackendStartResult
} from "./backend-requests";

export interface AudioBackend {
  readonly id: string;
  readonly capabilities: AudioBackendCapabilities;
  start(request: BackendPlaybackRequest): BackendStartResult;
  stop(instanceIds: PlaybackInstanceId[], fadeMs: number): void;
  pause(instanceIds: PlaybackInstanceId[]): void;
  resume(instanceIds: PlaybackInstanceId[]): void;
  seek(instanceId: PlaybackInstanceId, positionMs: number): boolean;
  updateInstances(updates: BackendPlaybackUpdate[]): void;
  setBuses(buses: AudioBusState[]): void;
  setListeners(listeners: AudioListenerState[]): void;
  setEmitters(emitters: AudioEmitterState[]): void;
  setGlobalParameter(id: AudioParameterId, value: AudioParameterValue): void;
  unlock(): Promise<boolean> | boolean;
  suspend(): void;
  resumeOutput(): void;
  setEventListener(listener: ((event: AudioBackendEvent) => void) | undefined): void;
  snapshot(): AudioBackendSnapshot;
  dispose(): void;
}
