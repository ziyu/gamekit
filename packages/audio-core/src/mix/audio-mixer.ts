import type { AudioBackend } from "../backend/audio-backend";
import type { CompiledAudioCatalog } from "../catalog/audio-catalog";
import { createAudioError } from "../contracts/errors";
import type { AudioDiagnosticSink } from "../observability/audio-diagnostics";
import { createAudioBusTree, type MutableAudioBus } from "./bus-tree";
import { createAudioParameterStore } from "./parameter-store";
import type {
  AudioBusState,
  AudioMixActivationState,
  AudioMixer,
  AudioMixerSnapshot
} from "./mix-types";

type Ramp = { from: number; to: number; startedAt: number; endsAt: number };
type MutableActivation = AudioMixActivationState & Ramp;

export type AudioMixerController = AudioMixer & {
  update(now: number): void;
  busContains(ancestorId: string, candidateId: string): boolean;
  validateInstanceParameter(
    id: string,
    value: string | number | boolean
  ): string | number | boolean;
  dispose(): void;
};

export function createAudioMixer(options: {
  catalog: CompiledAudioCatalog;
  backend: AudioBackend;
  diagnostics: AudioDiagnosticSink;
  clock(): number;
}): AudioMixerController {
  const buses = createAudioBusTree(options.catalog.buses);
  const parameters = createAudioParameterStore({
    definitions: options.catalog.parameters,
    initial: options.catalog.globalParameters,
    backend: options.backend
  });
  const activations = new Map<string, MutableActivation>();
  let activationSequence = 0;
  let disposed = false;

  const mixer: AudioMixerController = {
    setBus(busId, state, transitionMs = 0) {
      requireActive();
      buses.set(busId, state, Math.max(0, transitionMs), options.clock());
      flush();
      options.diagnostics.push("audio.mix.bus_changed", { busId, transitionMs });
    },
    activateSnapshot(snapshotId, input = {}) {
      requireActive();
      const definition = options.catalog.mixSnapshots.get(snapshotId);
      if (definition === undefined) {
        throw createAudioError(
          "audio.snapshot_missing",
          `Audio mix snapshot is missing: ${snapshotId}`
        );
      }
      const activationId = input.activationId ?? `mix.${activationSequence}`;
      activationSequence += 1;
      if (activations.has(activationId)) {
        throw createAudioError(
          "audio.duplicate_definition",
          `Audio mix activation already exists: ${activationId}`
        );
      }
      const now = options.clock();
      const target = Math.min(1, Math.max(0, input.weight ?? 1));
      const fadeMs = Math.max(0, input.fadeMs ?? 0);
      activations.set(activationId, {
        activationId,
        snapshotId,
        ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
        priority: definition.priority ?? 0,
        weight: fadeMs > 0 ? 0 : target,
        targetWeight: target,
        from: 0,
        to: target,
        startedAt: now,
        endsAt: now + fadeMs
      });
      flush();
      options.diagnostics.push("audio.mix.snapshot_activated", {
        snapshotId,
        activationId,
        fadeMs
      });
      return activationId;
    },
    deactivateSnapshot(activationId, fadeMs = 0) {
      requireActive();
      const activation = activations.get(activationId);
      if (activation === undefined) {
        return false;
      }
      const now = options.clock();
      const duration = Math.max(0, fadeMs);
      if (duration === 0) {
        activations.delete(activationId);
      } else {
        activation.from = activation.weight;
        activation.to = 0;
        activation.targetWeight = 0;
        activation.startedAt = now;
        activation.endsAt = now + duration;
      }
      flush();
      options.diagnostics.push("audio.mix.snapshot_deactivated", {
        activationId,
        fadeMs: duration
      });
      return true;
    },
    releaseOwner(ownerId, fadeMs = 0) {
      requireActive();
      const ids = [...activations.values()]
        .filter((activation) => activation.ownerId === ownerId)
        .map((activation) => activation.activationId);
      for (const id of ids) {
        mixer.deactivateSnapshot(id, fadeMs);
      }
      return ids.length;
    },
    setGlobalParameter(parameterId, value) {
      requireActive();
      parameters.setGlobal(parameterId, value);
      options.diagnostics.push("audio.parameter.global_changed", { parameterId });
    },
    getBus(busId) {
      const state = snapshotBus(buses.get(busId));
      return state;
    },
    snapshot(): AudioMixerSnapshot {
      return {
        buses: buses.values().map((bus) => snapshotBus(bus) as AudioBusState),
        activations: sortedActivations().map(
          ({ from: _from, to: _to, startedAt: _started, endsAt: _ends, ...state }) => ({ ...state })
        ),
        globalParameters: parameters.snapshot()
      };
    },
    update(now) {
      requireActive();
      let changed = buses.update(now);
      for (const [id, activation] of activations) {
        const progress =
          activation.endsAt <= activation.startedAt
            ? 1
            : Math.min(
                1,
                Math.max(
                  0,
                  (now - activation.startedAt) / (activation.endsAt - activation.startedAt)
                )
              );
        const next = activation.from + (activation.to - activation.from) * progress;
        changed ||= next !== activation.weight;
        activation.weight = next;
        if (progress >= 1 && activation.targetWeight === 0) {
          activations.delete(id);
        }
      }
      if (changed) {
        flush();
      }
    },
    busContains: (ancestorId, candidateId) => buses.contains(ancestorId, candidateId),
    validateInstanceParameter: (id, value) => parameters.validateInstance(id, value),
    dispose() {
      activations.clear();
      disposed = true;
    }
  };

  flush();
  for (const [id, value] of Object.entries(options.catalog.globalParameters)) {
    options.backend.setGlobalParameter(id, value);
  }
  return mixer;

  function snapshotBus(bus: MutableAudioBus | undefined): AudioBusState | undefined {
    if (bus === undefined) {
      return undefined;
    }
    let current: MutableAudioBus | undefined = bus;
    let effectiveVolume = 1;
    let effectiveMuted = false;
    let effectivePaused = false;
    while (current !== undefined) {
      const local = localMix(current);
      effectiveVolume *= local.volume;
      effectiveMuted ||= local.muted;
      effectivePaused ||= local.paused;
      current = current.parentId === undefined ? undefined : buses.get(current.parentId);
    }
    return {
      id: bus.id,
      ...(bus.parentId === undefined ? {} : { parentId: bus.parentId }),
      volume: bus.volume,
      targetVolume: bus.targetVolume,
      muted: bus.muted,
      paused: bus.paused,
      effectiveVolume,
      effectiveMuted,
      effectivePaused,
      ...(bus.maxPlaybackInstances === undefined
        ? {}
        : { maxPlaybackInstances: bus.maxPlaybackInstances })
    };
  }

  function localMix(bus: MutableAudioBus): { volume: number; muted: boolean; paused: boolean } {
    let volume = bus.volume;
    let muted = bus.muted;
    let paused = bus.paused;
    for (const activation of sortedActivations()) {
      if (activation.weight <= 0) {
        continue;
      }
      const definition = options.catalog.mixSnapshots.get(activation.snapshotId);
      const override = definition?.buses.find((candidate) => candidate.busId === bus.id);
      if (override === undefined) {
        continue;
      }
      if (override.volume !== undefined) {
        volume *= 1 + (override.volume - 1) * activation.weight;
      }
      if (activation.weight >= 0.5) {
        muted = override.muted ?? muted;
        paused = override.paused ?? paused;
      }
    }
    return { volume, muted, paused };
  }

  function sortedActivations(): MutableActivation[] {
    return [...activations.values()].sort(
      (left, right) =>
        left.priority - right.priority || left.activationId.localeCompare(right.activationId)
    );
  }

  function flush(): void {
    options.backend.setBuses(buses.values().map((bus) => snapshotBus(bus) as AudioBusState));
  }

  function requireActive(): void {
    if (disposed) {
      throw createAudioError("audio.runtime_disposed", "Audio mixer is disposed");
    }
  }
}
