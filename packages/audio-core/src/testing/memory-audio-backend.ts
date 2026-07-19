import type { AudioBackend } from "../backend/audio-backend";
import type { AudioBackendCapabilities } from "../backend/backend-capabilities";
import type { AudioBackendEvent } from "../backend/backend-events";
import type {
  AudioBackendSnapshot,
  BackendPlaybackRequest,
  BackendPlaybackUpdate
} from "../backend/backend-requests";
import type { AudioParameterValue } from "../catalog/parameter-definition";
import { nonNegativeInteger } from "../catalog/validation";
import type { AudioBusState } from "../mix/mix-types";
import { cloneEmitter, cloneListener, clonePlaybackState } from "../playback/playback-state";
import type { AudioEmitterState, AudioListenerState } from "../spatial/spatial-types";

export type MemoryAudioBackendCommand =
  | { type: "start"; request: BackendPlaybackRequest }
  | { type: "stop"; instanceIds: string[]; fadeMs: number }
  | { type: "pause"; instanceIds: string[] }
  | { type: "resume"; instanceIds: string[] }
  | { type: "seek"; instanceId: string; positionMs: number }
  | { type: "update-instances"; updates: BackendPlaybackUpdate[] }
  | { type: "set-buses"; buses: AudioBusState[] }
  | { type: "set-listeners"; listeners: AudioListenerState[] }
  | { type: "set-emitters"; emitters: AudioEmitterState[] }
  | { type: "set-global-parameter"; id: string; value: AudioParameterValue }
  | { type: "unlock" }
  | { type: "suspend" }
  | { type: "resume-output" };

export type MemoryAudioBackend = AudioBackend & {
  complete(instanceId: string): void;
  fail(instanceId: string): void;
  marker(instanceId: string, markerId: string, positionMs: number): void;
  instances(): BackendPlaybackRequest[];
  commands(): MemoryAudioBackendCommand[];
};

export type CreateMemoryAudioBackendOptions = {
  id?: string | undefined;
  maxRetainedCommands?: number | undefined;
  unlocked?: boolean | undefined;
  unlockSucceeds?: boolean | undefined;
  rejectSourceIds?: string[] | undefined;
};

const CAPABILITIES: AudioBackendCapabilities = {
  pause: true,
  seek: true,
  fades: true,
  scheduledStart: true,
  multipleTracks: true,
  spatial: true,
  multipleListeners: true,
  parameters: true,
  markers: true,
  streaming: true,
  authoredObjects: true
};

export function createMemoryAudioBackend(
  options: CreateMemoryAudioBackendOptions = {}
): MemoryAudioBackend {
  const id = options.id ?? "audio.memory";
  const maxRetainedCommands = nonNegativeInteger(
    options.maxRetainedCommands,
    1_024,
    "memory backend command limit"
  );
  const rejected = new Set(options.rejectSourceIds ?? []);
  const active = new Map<string, BackendPlaybackRequest>();
  const retained: MemoryAudioBackendCommand[] = [];
  const buses = new Map<string, AudioBusState>();
  const listeners = new Map<string, AudioListenerState>();
  const emitters = new Map<string, AudioEmitterState>();
  const parameters: Record<string, AudioParameterValue> = {};
  let eventListener: ((event: AudioBackendEvent) => void) | undefined;
  let unlocked = options.unlocked ?? false;
  let suspended = false;
  let disposed = false;

  return {
    id,
    capabilities: { ...CAPABILITIES },
    start(request) {
      retain({ type: "start", request: cloneRequest(request) });
      if (rejected.has(request.instance.sourceId)) {
        return { accepted: false, reason: "fixture-rejected" };
      }
      active.set(request.instance.id, cloneRequest(request));
      return { accepted: true };
    },
    stop(instanceIds, fadeMs) {
      retain({ type: "stop", instanceIds: [...instanceIds], fadeMs });
      for (const instanceId of instanceIds) {
        if (active.delete(instanceId)) {
          eventListener?.({ type: "ended", instanceId, reason: "stopped" });
        }
      }
    },
    pause(instanceIds) {
      retain({ type: "pause", instanceIds: [...instanceIds] });
      for (const id of instanceIds) {
        const request = active.get(id);
        if (request !== undefined) {
          request.instance.status = "paused";
        }
      }
    },
    resume(instanceIds) {
      retain({ type: "resume", instanceIds: [...instanceIds] });
      for (const id of instanceIds) {
        const request = active.get(id);
        if (request !== undefined) {
          request.instance.status = "playing";
        }
      }
    },
    seek(instanceId, positionMs) {
      retain({ type: "seek", instanceId, positionMs });
      const request = active.get(instanceId);
      if (request === undefined) {
        return false;
      }
      request.instance.positionMs = positionMs;
      return true;
    },
    updateInstances(updates) {
      const values = updates.map(cloneUpdate);
      retain({ type: "update-instances", updates: values });
      for (const update of values) {
        const request = active.get(update.instanceId);
        if (request !== undefined) {
          request.instance = clonePlaybackState(update.state);
          request.emitter = update.emitter === undefined ? undefined : cloneEmitter(update.emitter);
        }
      }
    },
    setBuses(values) {
      buses.clear();
      for (const bus of values) {
        buses.set(bus.id, { ...bus });
      }
      retain({ type: "set-buses", buses: values.map((bus) => ({ ...bus })) });
    },
    setListeners(values) {
      listeners.clear();
      for (const listener of values) {
        listeners.set(listener.id, cloneListener(listener));
      }
      retain({ type: "set-listeners", listeners: values.map(cloneListener) });
    },
    setEmitters(values) {
      emitters.clear();
      for (const emitter of values) {
        emitters.set(emitter.id, cloneEmitter(emitter));
      }
      retain({ type: "set-emitters", emitters: values.map(cloneEmitter) });
    },
    setGlobalParameter(parameterId, value) {
      parameters[parameterId] = value;
      retain({ type: "set-global-parameter", id: parameterId, value });
    },
    async unlock() {
      retain({ type: "unlock" });
      unlocked = options.unlockSucceeds ?? true;
      return unlocked;
    },
    suspend() {
      suspended = true;
      retain({ type: "suspend" });
    },
    resumeOutput() {
      suspended = false;
      retain({ type: "resume-output" });
    },
    setEventListener(listener) {
      eventListener = listener;
    },
    complete(instanceId) {
      if (active.delete(instanceId)) {
        eventListener?.({ type: "ended", instanceId, reason: "completed" });
      }
    },
    fail(instanceId) {
      if (active.delete(instanceId)) {
        eventListener?.({ type: "ended", instanceId, reason: "failed" });
      }
    },
    marker(instanceId, markerId, positionMs) {
      if (active.has(instanceId)) {
        eventListener?.({ type: "marker", instanceId, markerId, positionMs });
      }
    },
    instances() {
      return [...active.values()]
        .sort((left, right) => left.instance.id.localeCompare(right.instance.id))
        .map(cloneRequest);
    },
    commands() {
      return retained.map(cloneCommand);
    },
    snapshot(): AudioBackendSnapshot {
      return {
        id,
        activePlaybackInstances: active.size,
        nativePlaybackCount: [...active.values()].reduce(
          (total, request) => total + Math.max(1, request.instance.tracks.length),
          0
        ),
        retainedCommands: retained.length,
        unlocked,
        suspended,
        disposed,
        capabilities: { ...CAPABILITIES },
        details: {
          buses: buses.size,
          listeners: listeners.size,
          emitters: emitters.size,
          parameters: Object.keys(parameters).length
        }
      };
    },
    dispose() {
      active.clear();
      retained.length = 0;
      buses.clear();
      listeners.clear();
      emitters.clear();
      for (const key of Object.keys(parameters)) {
        delete parameters[key];
      }
      eventListener = undefined;
      disposed = true;
    }
  };

  function retain(command: MemoryAudioBackendCommand): void {
    if (maxRetainedCommands === 0) {
      return;
    }
    retained.push(command);
    if (retained.length > maxRetainedCommands) {
      retained.splice(0, retained.length - maxRetainedCommands);
    }
  }
}

function cloneRequest(request: BackendPlaybackRequest): BackendPlaybackRequest {
  return {
    ...request,
    instance: clonePlaybackState(request.instance),
    listeners: request.listeners.map(cloneListener),
    ...(request.emitter === undefined ? {} : { emitter: cloneEmitter(request.emitter) })
  };
}

function cloneUpdate(update: BackendPlaybackUpdate): BackendPlaybackUpdate {
  return {
    ...update,
    state: clonePlaybackState(update.state),
    ...(update.emitter === undefined ? {} : { emitter: cloneEmitter(update.emitter) })
  };
}

function cloneCommand(command: MemoryAudioBackendCommand): MemoryAudioBackendCommand {
  switch (command.type) {
    case "start":
      return { type: "start", request: cloneRequest(command.request) };
    case "update-instances":
      return { type: "update-instances", updates: command.updates.map(cloneUpdate) };
    case "set-buses":
      return { type: "set-buses", buses: command.buses.map((bus) => ({ ...bus })) };
    case "set-listeners":
      return { type: "set-listeners", listeners: command.listeners.map(cloneListener) };
    case "set-emitters":
      return { type: "set-emitters", emitters: command.emitters.map(cloneEmitter) };
    case "stop":
    case "pause":
    case "resume":
      return { ...command, instanceIds: [...command.instanceIds] };
    default:
      return { ...command };
  }
}
