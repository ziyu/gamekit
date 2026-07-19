import type { AudioBackend } from "../backend/audio-backend";
import type { AudioBackendEvent } from "../backend/backend-events";
import type { BackendPlaybackUpdate } from "../backend/backend-requests";
import type { AudioParameterValue } from "../catalog/parameter-definition";
import type { AudioMarkerDefinition, ResolvedAudioTrack } from "../catalog/source-definition";
import {
  finite,
  nonNegative,
  positive,
  positiveInteger,
  stereoPan,
  unitInterval
} from "../catalog/validation";
import { createAudioError } from "../contracts/errors";
import type { PlaybackInstanceId } from "../contracts/identifiers";
import type {
  PlaybackCategory,
  PlaybackBudget,
  PlaybackBudgets,
  PlaybackHandle,
  PlaybackInstanceState,
  PlaybackPatch,
  PlaybackTarget
} from "../contracts/playback";
import type { AudioMixerController } from "../mix/audio-mixer";
import type { AudioDiagnosticSink } from "../observability/audio-diagnostics";
import type { GameAudioEvent } from "../observability/lifecycle-events";
import type { SpatialAudioController } from "../spatial/spatial-audio";
import type { AudioSpatialDefinition, AudioTransform } from "../spatial/spatial-types";
import { createPlaybackFadeController } from "./fade-controller";
import { createPlaybackInstanceRegistry } from "./instance-registry";
import { cloneEmitter, clonePlaybackState, cloneTransform } from "./playback-state";

export type PlaybackStartInput = {
  instanceId?: PlaybackInstanceId | undefined;
  category: PlaybackCategory;
  sourceId: string;
  tracks: ResolvedAudioTrack[];
  backendObject?: string | undefined;
  busId: string;
  volume?: number | undefined;
  pitch?: number | undefined;
  pan?: number | undefined;
  loop?: boolean | undefined;
  priority?: number | undefined;
  delayMs?: number | undefined;
  startOffsetMs?: number | undefined;
  fadeInMs?: number | undefined;
  ownerId?: string | undefined;
  emitterId?: string | undefined;
  transform?: AudioTransform | undefined;
  spatial?: AudioSpatialDefinition | undefined;
  parameters?: Record<string, AudioParameterValue> | undefined;
  markers?: AudioMarkerDefinition[] | undefined;
  tags?: string[] | undefined;
  replaceInstanceIds?: PlaybackInstanceId[] | undefined;
};

export type PlaybackStartResult =
  | {
      status: "playing" | "scheduled";
      handle: PlaybackHandle;
      stoppedInstanceIds: PlaybackInstanceId[];
    }
  | {
      status: "rejected";
      reason: "backend-rejected" | "duplicate-instance-id" | "capacity";
    };

export type PlaybackCoordinatorSnapshot = {
  instances: PlaybackInstanceState[];
  activePlaybackInstances: number;
  nativePlaybackCount: number;
};

export type PlaybackCoordinator = {
  start(input: PlaybackStartInput): PlaybackStartResult;
  handle(instanceId: PlaybackInstanceId): PlaybackHandle | undefined;
  get(instanceId: PlaybackInstanceId): PlaybackInstanceState | undefined;
  list(target?: PlaybackTarget): PlaybackInstanceState[];
  stop(target?: PlaybackTarget, fadeMs?: number): number;
  pause(target?: PlaybackTarget): number;
  resume(target?: PlaybackTarget): number;
  seek(instanceId: PlaybackInstanceId, positionMs: number): boolean;
  set(instanceId: PlaybackInstanceId, patch: PlaybackPatch, transitionMs?: number): boolean;
  setParameter(
    instanceId: PlaybackInstanceId,
    parameterId: string,
    value: AudioParameterValue
  ): boolean;
  replaceTracks(
    instanceId: PlaybackInstanceId,
    tracks: ResolvedAudioTrack[],
    transitionMs?: number
  ): boolean;
  complete(instanceId: PlaybackInstanceId, reason: "completed" | "stopped" | "failed"): void;
  subscribe(listener: (event: GameAudioEvent) => void): () => void;
  update(deltaMs: number, now: number): void;
  snapshot(): PlaybackCoordinatorSnapshot;
  dispose(): void;
};

export function createPlaybackCoordinator(options: {
  backend: AudioBackend;
  mixer: AudioMixerController;
  spatial: SpatialAudioController;
  diagnostics: AudioDiagnosticSink;
  clock(): number;
  maxPlaybackInstances?: number | undefined;
  maxNativePlaybackCount?: number | undefined;
  budgets?: PlaybackBudgets | undefined;
  onEvent?: ((event: GameAudioEvent) => void) | undefined;
  onEventError?: ((error: unknown, event: GameAudioEvent) => void) | undefined;
}): PlaybackCoordinator {
  const maxPlaybackInstances = positiveInteger(
    options.maxPlaybackInstances,
    67,
    "maxPlaybackInstances"
  );
  const maxNativePlaybackCount = positiveInteger(
    options.maxNativePlaybackCount,
    148,
    "maxNativePlaybackCount"
  );
  const budgets: Record<PlaybackCategory, PlaybackBudget> = {
    music: compileBudget("music", options.budgets?.music, {
      maxPlaybackInstances: 2,
      maxNativePlaybackCount: 16
    }),
    sfx: compileBudget("sfx", options.budgets?.sfx, {
      maxPlaybackInstances: 64,
      maxNativePlaybackCount: 128
    }),
    dialogue: compileBudget("dialogue", options.budgets?.dialogue, {
      maxPlaybackInstances: 1,
      maxNativePlaybackCount: 4
    })
  };
  const instances = createPlaybackInstanceRegistry();
  const fades = createPlaybackFadeController();
  const markerTimelines = new Map<
    PlaybackInstanceId,
    { definitions: AudioMarkerDefinition[]; emitted: Set<string> }
  >();
  const listeners = new Set<(event: GameAudioEvent) => void>();
  let nextInstanceId = 0;
  let eventSequence = 0;
  let disposed = false;

  const coordinator: PlaybackCoordinator = {
    start(input) {
      requireActive();
      const id = input.instanceId ?? `playback.${nextInstanceId}`;
      nextInstanceId += 1;
      if (instances.has(id)) {
        return { status: "rejected", reason: "duplicate-instance-id" };
      }
      const bus = options.mixer.getBus(input.busId);
      if (bus === undefined) {
        throw createAudioError("audio.bus_missing", `Audio bus is missing: ${input.busId}`, {
          busId: input.busId,
          sourceId: input.sourceId
        });
      }
      if (input.backendObject !== undefined && !options.backend.capabilities.authoredObjects) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "authoredObjects",
          sourceId: input.sourceId
        });
        return { status: "rejected", reason: "backend-rejected" };
      }
      if (input.tracks.length > 1 && !options.backend.capabilities.multipleTracks) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "multipleTracks",
          sourceId: input.sourceId,
          result: "rejected"
        });
        return { status: "rejected", reason: "backend-rejected" };
      }
      const now = options.clock();
      const requestedDelayMs = nonNegative(input.delayMs, 0, "playback delayMs");
      const delayMs = options.backend.capabilities.scheduledStart ? requestedDelayMs : 0;
      if (requestedDelayMs > 0 && !options.backend.capabilities.scheduledStart) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "scheduledStart",
          sourceId: input.sourceId,
          result: "started-immediately"
        });
      }
      const fadeInMs = options.backend.capabilities.fades
        ? nonNegative(input.fadeInMs, 0, "playback fadeInMs")
        : 0;
      if ((input.fadeInMs ?? 0) > 0 && !options.backend.capabilities.fades) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "fades",
          sourceId: input.sourceId
        });
      }
      const parameters: Record<string, AudioParameterValue> = {};
      for (const [parameterId, value] of Object.entries(input.parameters ?? {})) {
        parameters[parameterId] = options.mixer.validateInstanceParameter(parameterId, value);
      }
      if (Object.keys(parameters).length > 0 && !options.backend.capabilities.parameters) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "parameters",
          sourceId: input.sourceId,
          result: "core-state-only"
        });
      }
      if (input.spatial !== undefined && !options.backend.capabilities.spatial) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "spatial",
          sourceId: input.sourceId,
          result: "non-spatial-output"
        });
      }
      const state: PlaybackInstanceState = {
        id,
        category: input.category,
        sourceId: input.sourceId,
        status: delayMs > 0 ? "scheduled" : "playing",
        busId: input.busId,
        tracks: input.tracks.map((track) => ({
          ...track,
          asset: { ...track.asset },
          startOffsetMs: track.startOffsetMs + nonNegative(input.startOffsetMs, 0, "startOffsetMs")
        })),
        ...(input.backendObject === undefined ? {} : { backendObject: input.backendObject }),
        volume: unitInterval(input.volume, 1, "playback volume"),
        effectiveVolume: unitInterval(input.volume, 1, "playback volume") * bus.effectiveVolume,
        pitch: positive(input.pitch, 1, "playback pitch"),
        pan: stereoPan(input.pan),
        loop: input.loop ?? input.tracks.some((track) => track.loop),
        priority: finite(input.priority, 0, "playback priority"),
        startedAt: now + delayMs,
        scheduledAt: now,
        updatedAt: now,
        positionMs: nonNegative(input.startOffsetMs, 0, "playback startOffsetMs"),
        ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
        ...(input.emitterId === undefined ? {} : { emitterId: input.emitterId }),
        ...(input.transform === undefined ? {} : { transform: cloneTransform(input.transform) }),
        ...(input.spatial === undefined ? {} : { spatial: { ...input.spatial } }),
        parameters,
        tags: [...(input.tags ?? [])]
      };
      const capacityVictims = selectCapacityVictims(state, input.replaceInstanceIds ?? []);
      if (capacityVictims === undefined) {
        options.diagnostics.push("audio.playback.rejected", {
          category: input.category,
          sourceId: input.sourceId,
          reason: "capacity"
        });
        return { status: "rejected", reason: "capacity" };
      }
      const emitter = resolvedEmitter(state);
      const listeners = options.spatial.listeners();
      const primaryListener = options.spatial.primaryListener();
      const backendListeners = options.backend.capabilities.multipleListeners
        ? listeners
        : primaryListener === undefined
          ? []
          : [primaryListener];
      if (listeners.length > 1 && !options.backend.capabilities.multipleListeners) {
        options.diagnostics.push("audio.playback.capability_degraded", {
          capability: "multipleListeners",
          sourceId: input.sourceId,
          result: "primary-listener-only"
        });
      }
      const accepted = options.backend.start({
        instance: clonePlaybackState(state),
        delayMs,
        fadeInMs,
        muted: bus.effectiveMuted,
        paused: bus.effectivePaused,
        listeners: backendListeners,
        ...(emitter === undefined ? {} : { emitter: cloneEmitter(emitter) })
      });
      if (!accepted.accepted) {
        options.diagnostics.push("audio.playback.backend_rejected", {
          category: input.category,
          sourceId: input.sourceId,
          reason: accepted.reason
        });
        return { status: "rejected", reason: "backend-rejected" };
      }
      instances.add(state);
      const markerDefinitions = (input.markers ?? []).map((marker) => ({ ...marker }));
      markerTimelines.set(id, {
        definitions: markerDefinitions,
        emitted: new Set(
          markerDefinitions
            .filter((marker) => marker.positionMs < state.positionMs)
            .map((marker) => marker.id)
        )
      });
      const stoppedInstanceIds = uniqueIds([
        ...(input.replaceInstanceIds ?? []),
        ...capacityVictims
      ]).filter((candidate) => candidate !== id && instances.has(candidate));
      if (stoppedInstanceIds.length > 0) {
        stopIds(stoppedInstanceIds, 0);
      }
      publish({
        type: state.status === "scheduled" ? "scheduled" : "started",
        instanceId: id,
        category: state.category,
        sourceId: state.sourceId
      });
      if (state.status === "playing") {
        publishDueMarkers(state, state.positionMs, state.positionMs, true);
      }
      options.diagnostics.push("audio.playback.started", {
        instanceId: id,
        category: state.category,
        sourceId: state.sourceId,
        busId: state.busId
      });
      return {
        status: state.status === "scheduled" ? "scheduled" : "playing",
        handle: createHandle(id),
        stoppedInstanceIds
      };
    },
    handle(instanceId) {
      return instances.has(instanceId) ? createHandle(instanceId) : undefined;
    },
    get(instanceId) {
      const state = instances.get(instanceId);
      return state === undefined ? undefined : clonePlaybackState(state);
    },
    list(target) {
      return instances.list(target).map(clonePlaybackState);
    },
    stop(target = {}, fadeMs = 0) {
      requireActive();
      const ids = instances.list(target).map((instance) => instance.id);
      stopIds(ids, fadeMs);
      return ids.length;
    },
    pause(target = {}) {
      requireActive();
      const values = instances
        .list(target)
        .filter((instance) => instance.status === "playing" || instance.status === "scheduled");
      const ids = values.map((instance) => instance.id);
      for (const instance of values) {
        instance.status = "paused";
        instance.updatedAt = options.clock();
        publishFor(instance, "paused");
      }
      if (ids.length > 0) {
        options.backend.pause(ids);
      }
      return ids.length;
    },
    resume(target = {}) {
      requireActive();
      const values = instances.list(target).filter((instance) => instance.status === "paused");
      const ids = values.map((instance) => instance.id);
      for (const instance of values) {
        instance.status = options.clock() < instance.startedAt ? "scheduled" : "playing";
        instance.updatedAt = options.clock();
        publishFor(instance, "resumed");
      }
      if (ids.length > 0) {
        options.backend.resume(ids);
      }
      return ids.length;
    },
    seek(instanceId, positionMs) {
      requireActive();
      const instance = instances.get(instanceId);
      if (instance === undefined || !options.backend.capabilities.seek) {
        return false;
      }
      const position = nonNegative(positionMs, 0, "playback positionMs");
      if (!options.backend.seek(instanceId, position)) {
        return false;
      }
      instance.positionMs = position;
      instance.updatedAt = options.clock();
      const timeline = markerTimelines.get(instanceId);
      if (timeline !== undefined) {
        timeline.emitted = new Set(
          timeline.definitions
            .filter((marker) => marker.positionMs <= position)
            .map((marker) => marker.id)
        );
      }
      return true;
    },
    set(instanceId, patch, transitionMs = 0) {
      requireActive();
      const instance = instances.get(instanceId);
      if (instance === undefined) {
        return false;
      }
      applyPatch(instance, patch);
      sendUpdates([instance], transitionMs);
      return true;
    },
    setParameter(instanceId, parameterId, value) {
      requireActive();
      const instance = instances.get(instanceId);
      if (instance === undefined) {
        return false;
      }
      instance.parameters[parameterId] = options.mixer.validateInstanceParameter(
        parameterId,
        value
      );
      instance.updatedAt = options.clock();
      sendUpdates([instance], 0);
      return true;
    },
    replaceTracks(instanceId, tracks, transitionMs = 0) {
      requireActive();
      const instance = instances.get(instanceId);
      if (instance === undefined) {
        return false;
      }
      instance.tracks = tracks.map((track) => ({ ...track, asset: { ...track.asset } }));
      instance.updatedAt = options.clock();
      sendUpdates([instance], transitionMs);
      return true;
    },
    complete(instanceId, reason) {
      const instance = instances.delete(instanceId);
      if (instance === undefined) {
        return;
      }
      fades.cancel(instanceId);
      markerTimelines.delete(instanceId);
      publishFor(
        instance,
        reason === "completed" ? "completed" : reason === "failed" ? "failed" : "stopped"
      );
      options.diagnostics.push(`audio.playback.${reason}`, {
        instanceId,
        category: instance.category,
        sourceId: instance.sourceId
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(deltaMs, now) {
      requireActive();
      const delta = Math.max(0, deltaMs);
      for (const instance of instances.list()) {
        const previousPosition = instance.positionMs;
        if (instance.status === "scheduled" && now >= instance.startedAt) {
          instance.status = "playing";
          instance.updatedAt = now;
          publishFor(instance, "started");
          instance.positionMs += Math.max(0, now - Math.max(instance.startedAt, now - delta));
          publishDueMarkers(instance, previousPosition, instance.positionMs, true);
        } else if (instance.status === "playing") {
          instance.positionMs += delta;
          publishDueMarkers(instance, previousPosition, instance.positionMs, false);
        }
        const bus = options.mixer.getBus(instance.busId);
        instance.effectiveVolume = instance.volume * (bus?.effectiveVolume ?? 1);
      }
      for (const instanceId of fades.due(now)) {
        coordinator.complete(instanceId, "stopped");
      }
    },
    snapshot() {
      const values = instances.list().map(clonePlaybackState);
      return {
        instances: values,
        activePlaybackInstances: values.length,
        nativePlaybackCount: values.reduce(
          (total, instance) => total + Math.max(1, instance.tracks.length),
          0
        )
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      const ids = instances.list().map((instance) => instance.id);
      if (ids.length > 0) {
        options.backend.stop(ids, 0);
      }
      instances.clear();
      fades.clear();
      markerTimelines.clear();
      listeners.clear();
      options.backend.setEventListener(undefined);
      disposed = true;
    }
  };

  options.backend.setEventListener(handleBackendEvent);
  return coordinator;

  function selectCapacityVictims(
    incoming: PlaybackInstanceState,
    requestedReplacements: PlaybackInstanceId[]
  ): PlaybackInstanceId[] | undefined {
    const retained = instances
      .list()
      .filter((instance) => !requestedReplacements.includes(instance.id));
    const victims: PlaybackInstanceState[] = [];
    const incomingNative = Math.max(1, incoming.tracks.length);
    const categoryBudget = budgets[incoming.category];
    while (true) {
      const active = retained.filter((instance) => !victims.includes(instance));
      const activeCategory = active.filter((instance) => instance.category === incoming.category);
      const activeNative = active.reduce(
        (total, instance) => total + Math.max(1, instance.tracks.length),
        0
      );
      const activeCategoryNative = activeCategory.reduce(
        (total, instance) => total + Math.max(1, instance.tracks.length),
        0
      );
      const busViolation = options.mixer
        .snapshot()
        .buses.find(
          (bus) =>
            bus.maxPlaybackInstances !== undefined &&
            options.mixer.busContains(bus.id, incoming.busId) &&
            active.filter((instance) => options.mixer.busContains(bus.id, instance.busId)).length >=
              bus.maxPlaybackInstances
        );
      const exceedsGlobal = active.length >= maxPlaybackInstances;
      const exceedsNative = activeNative + incomingNative > maxNativePlaybackCount;
      const exceedsCategory = activeCategory.length >= categoryBudget.maxPlaybackInstances;
      const exceedsCategoryNative =
        activeCategoryNative + incomingNative > categoryBudget.maxNativePlaybackCount;
      if (
        !exceedsGlobal &&
        !exceedsNative &&
        !exceedsCategory &&
        !exceedsCategoryNative &&
        busViolation === undefined
      ) {
        return victims.map((instance) => instance.id);
      }
      const candidates =
        busViolation === undefined
          ? activeCategory
          : activeCategory.filter((instance) =>
              options.mixer.busContains(busViolation.id, instance.busId)
            );
      const candidate = [...candidates].sort(
        (left, right) =>
          left.priority - right.priority ||
          left.startedAt - right.startedAt ||
          left.id.localeCompare(right.id)
      )[0];
      if (candidate === undefined || candidate.priority > incoming.priority) {
        return undefined;
      }
      victims.push(candidate);
    }
  }

  function stopIds(instanceIds: PlaybackInstanceId[], fadeMs: number): void {
    const ids = uniqueIds(instanceIds).filter((id) => instances.has(id));
    if (ids.length === 0) {
      return;
    }
    const duration = options.backend.capabilities.fades ? Math.max(0, fadeMs) : 0;
    const now = options.clock();
    for (const id of ids) {
      const instance = instances.get(id);
      if (instance !== undefined) {
        instance.status = "stopping";
        instance.updatedAt = now;
        publishFor(instance, "stopping");
        if (duration > 0) {
          fades.scheduleStop(id, now + duration);
        }
      }
    }
    options.backend.stop(ids, duration);
    if (duration === 0) {
      for (const id of ids) {
        coordinator.complete(id, "stopped");
      }
    }
  }

  function applyPatch(instance: PlaybackInstanceState, patch: PlaybackPatch): void {
    if (patch.volume !== undefined) {
      instance.volume = unitInterval(patch.volume, 1, "playback volume");
    }
    if (patch.pitch !== undefined) {
      instance.pitch = positive(patch.pitch, 1, "playback pitch");
    }
    if (patch.pan !== undefined) {
      instance.pan = stereoPan(patch.pan);
    }
    if (patch.loop !== undefined) {
      instance.loop = patch.loop;
      for (const track of instance.tracks) {
        track.loop = patch.loop;
      }
    }
    if (patch.emitterId !== undefined) {
      if (options.spatial.emitter(patch.emitterId) === undefined) {
        throw createAudioError(
          "audio.emitter_missing",
          `Audio emitter is missing: ${patch.emitterId}`
        );
      }
      instance.emitterId = patch.emitterId;
    }
    if (patch.transform !== undefined) {
      instance.transform = cloneTransform(patch.transform);
    }
    instance.updatedAt = options.clock();
    const bus = options.mixer.getBus(instance.busId);
    instance.effectiveVolume = instance.volume * (bus?.effectiveVolume ?? 1);
  }

  function sendUpdates(values: PlaybackInstanceState[], transitionMs: number): void {
    const updates: BackendPlaybackUpdate[] = values.map((instance) => {
      const emitter = resolvedEmitter(instance);
      return {
        instanceId: instance.id,
        state: clonePlaybackState(instance),
        transitionMs: options.backend.capabilities.fades ? Math.max(0, transitionMs) : 0,
        ...(emitter === undefined ? {} : { emitter: cloneEmitter(emitter) })
      };
    });
    options.backend.updateInstances(updates);
  }

  function resolvedEmitter(instance: PlaybackInstanceState) {
    if (instance.transform !== undefined) {
      return {
        id: instance.emitterId ?? "inline",
        transform: cloneTransform(instance.transform),
        active: true
      };
    }
    return instance.emitterId === undefined
      ? undefined
      : options.spatial.emitter(instance.emitterId);
  }

  function createHandle(instanceId: PlaybackInstanceId): PlaybackHandle {
    return {
      id: instanceId,
      getState: () => coordinator.get(instanceId),
      pause: () => coordinator.pause({ instanceId }) > 0,
      resume: () => coordinator.resume({ instanceId }) > 0,
      seek: (positionMs) => coordinator.seek(instanceId, positionMs),
      set: (patch, transitionMs) => coordinator.set(instanceId, patch, transitionMs),
      setParameter: (parameterId, value) =>
        coordinator.setParameter(instanceId, parameterId, value),
      stop: (fadeOptions) => coordinator.stop({ instanceId }, fadeOptions?.fadeMs) > 0
    };
  }

  function handleBackendEvent(event: AudioBackendEvent): void {
    if (disposed) {
      return;
    }
    if (event.type === "ended") {
      coordinator.complete(event.instanceId, event.reason);
      return;
    }
    const instance = instances.get(event.instanceId);
    if (instance !== undefined) {
      const timeline = markerTimelines.get(event.instanceId);
      timeline?.emitted.add(event.markerId);
      publishMarker(instance, event.markerId, event.positionMs);
    }
  }

  function publishDueMarkers(
    instance: PlaybackInstanceState,
    fromPositionMs: number,
    toPositionMs: number,
    includeFrom: boolean
  ): void {
    const timeline = markerTimelines.get(instance.id);
    if (timeline === undefined) {
      return;
    }
    for (const marker of timeline.definitions) {
      if (
        !timeline.emitted.has(marker.id) &&
        (includeFrom ? marker.positionMs >= fromPositionMs : marker.positionMs > fromPositionMs) &&
        marker.positionMs <= toPositionMs
      ) {
        timeline.emitted.add(marker.id);
        publishMarker(instance, marker.id, marker.positionMs);
      }
    }
  }

  function publishMarker(
    instance: PlaybackInstanceState,
    markerId: string,
    positionMs: number
  ): void {
    publish({
      type: "marker",
      instanceId: instance.id,
      category: instance.category,
      sourceId: instance.sourceId,
      markerId,
      positionMs
    });
  }

  function publishFor(instance: PlaybackInstanceState, type: GameAudioEvent["type"]): void {
    publish({
      type,
      instanceId: instance.id,
      category: instance.category,
      sourceId: instance.sourceId
    });
  }

  function publish(event: Omit<GameAudioEvent, "sequence" | "timestamp">): void {
    const entry: GameAudioEvent = {
      sequence: eventSequence,
      timestamp: options.clock(),
      ...event
    };
    eventSequence += 1;
    for (const listener of listeners) {
      invoke(listener, entry);
    }
    if (options.onEvent !== undefined) {
      invoke(options.onEvent, entry);
    }
  }

  function invoke(observer: (event: GameAudioEvent) => void, event: GameAudioEvent): void {
    try {
      observer({ ...event });
    } catch (error) {
      try {
        options.onEventError?.(error, { ...event });
      } catch {
        // Presentation observers cannot alter audio semantics.
      }
    }
  }

  function requireActive(): void {
    if (disposed) {
      throw createAudioError("audio.runtime_disposed", "Game Audio playback is disposed");
    }
  }
}

function uniqueIds(ids: PlaybackInstanceId[]): PlaybackInstanceId[] {
  return [...new Set(ids)];
}

function compileBudget(
  category: PlaybackCategory,
  input: Partial<PlaybackBudget> | undefined,
  defaults: PlaybackBudget
): PlaybackBudget {
  return {
    maxPlaybackInstances: positiveInteger(
      input?.maxPlaybackInstances,
      defaults.maxPlaybackInstances,
      `${category} maxPlaybackInstances`
    ),
    maxNativePlaybackCount: positiveInteger(
      input?.maxNativePlaybackCount,
      defaults.maxNativePlaybackCount,
      `${category} maxNativePlaybackCount`
    )
  };
}
