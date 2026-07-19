import type { AudioBackend } from "../backend/audio-backend";
import { finite, nonNegative } from "../catalog/validation";
import { createAudioError } from "../contracts/errors";
import type { AudioEmitterId } from "../contracts/identifiers";
import type { AudioDiagnosticSink } from "../observability/audio-diagnostics";
import { cloneEmitter, cloneListener, cloneTransform } from "../playback/playback-state";
import type {
  AudioEmitterState,
  AudioListenerState,
  AudioSpatialDefinition,
  AudioTransform,
  RemoveEmitterOptions,
  SpatialAudio
} from "./spatial-types";

export type SpatialAudioController = SpatialAudio & {
  emitter(id: AudioEmitterId): AudioEmitterState | undefined;
  primaryListener(): AudioListenerState | undefined;
  isDistanceCulled(spatial: AudioSpatialDefinition, transform: AudioTransform): boolean;
  dispose(): void;
};

export function createSpatialAudio(options: {
  backend: AudioBackend;
  diagnostics: AudioDiagnosticSink;
  onRemoveEmitter?(emitterId: AudioEmitterId, options: RemoveEmitterOptions): void;
}): SpatialAudioController {
  const listeners = new Map<string, AudioListenerState>([
    [
      "main",
      {
        id: "main",
        transform: { position: { x: 0, y: 0, z: 0 } },
        weight: 1
      }
    ]
  ]);
  const emitters = new Map<string, AudioEmitterState>();
  let disposed = false;

  const spatial: SpatialAudioController = {
    setListener(listener) {
      requireActive();
      requireId(listener.id, "listener");
      listeners.set(listener.id, {
        id: listener.id,
        transform: validateTransform(listener.transform),
        weight: nonNegative(listener.weight, 1, "listener weight")
      });
      flushListeners();
    },
    removeListener(listenerId) {
      requireActive();
      const removed = listeners.delete(listenerId);
      if (removed) {
        flushListeners();
      }
      return removed;
    },
    setEmitter(emitter) {
      requireActive();
      requireId(emitter.id, "emitter");
      emitters.set(emitter.id, {
        id: emitter.id,
        transform: validateTransform(emitter.transform),
        ...(emitter.velocity === undefined
          ? {}
          : { velocity: validatePoint(emitter.velocity, "emitter velocity") }),
        active: emitter.active ?? true
      });
      flushEmitters();
    },
    setEmitters(values) {
      requireActive();
      for (const emitter of values) {
        requireId(emitter.id, "emitter");
        emitters.set(emitter.id, {
          id: emitter.id,
          transform: validateTransform(emitter.transform),
          ...(emitter.velocity === undefined
            ? {}
            : { velocity: validatePoint(emitter.velocity, "emitter velocity") }),
          active: emitter.active ?? true
        });
      }
      flushEmitters();
      return values.length;
    },
    removeEmitter(emitterId, removeOptions = {}) {
      requireActive();
      const removed = emitters.delete(emitterId);
      if (!removed) {
        return false;
      }
      flushEmitters();
      options.onRemoveEmitter?.(emitterId, removeOptions);
      options.diagnostics.push("audio.spatial.emitter_removed", {
        emitterId,
        stopPlayback: removeOptions.stopPlayback ?? false
      });
      return true;
    },
    listeners: () => sortedListeners(),
    emitters: () => sortedEmitters(),
    emitter(id) {
      const emitter = emitters.get(id);
      return emitter === undefined ? undefined : cloneEmitter(emitter);
    },
    primaryListener() {
      const listener = [...listeners.values()].sort(
        (left, right) => right.weight - left.weight || left.id.localeCompare(right.id)
      )[0];
      return listener === undefined ? undefined : cloneListener(listener);
    },
    isDistanceCulled(definition, transform) {
      if (definition.distanceCulling === false || listeners.size === 0) {
        return false;
      }
      let nearest = Number.POSITIVE_INFINITY;
      for (const listener of listeners.values()) {
        if (listener.weight <= 0) {
          continue;
        }
        const dx = transform.position.x - listener.transform.position.x;
        const dy = transform.position.y - listener.transform.position.y;
        const dz = (transform.position.z ?? 0) - (listener.transform.position.z ?? 0);
        nearest = Math.min(nearest, Math.hypot(dx, dy, dz));
      }
      return nearest > definition.maxDistance;
    },
    dispose() {
      listeners.clear();
      emitters.clear();
      disposed = true;
    }
  };

  flushListeners();
  flushEmitters();
  return spatial;

  function sortedListeners(): AudioListenerState[] {
    return [...listeners.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneListener);
  }

  function sortedEmitters(): AudioEmitterState[] {
    return [...emitters.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneEmitter);
  }

  function flushListeners(): void {
    options.backend.setListeners(sortedListeners());
  }

  function flushEmitters(): void {
    options.backend.setEmitters(sortedEmitters());
  }

  function requireActive(): void {
    if (disposed) {
      throw createAudioError("audio.runtime_disposed", "Audio spatial controller is disposed");
    }
  }
}

function validateTransform(transform: AudioTransform): AudioTransform {
  const result = cloneTransform(transform);
  result.position = validatePoint(result.position, "transform");
  return result;
}

function validatePoint(
  point: import("./spatial-types").AudioPoint,
  label: string
): import("./spatial-types").AudioPoint {
  return {
    x: finite(point.x, 0, `${label} x`),
    y: finite(point.y, 0, `${label} y`),
    ...(point.z === undefined ? {} : { z: finite(point.z, 0, `${label} z`) })
  };
}

function requireId(id: string, label: string): void {
  if (!id) {
    throw createAudioError("audio.invalid_config", `Audio ${label} id is required`);
  }
}
