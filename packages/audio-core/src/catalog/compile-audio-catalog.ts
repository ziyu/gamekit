import { createAudioError } from "../contracts/errors";
import type { DialogueLineDefinition } from "../dialogue/dialogue-line-definition";
import type { AudioBusDefinition, AudioMixSnapshotDefinition } from "../mix/mix-types";
import type { MusicTrackDefinition, MusicTransition } from "../music/music-definition";
import type {
  SfxConcurrencyDefinition,
  SfxEventDefinition,
  SfxEventLayerDefinition
} from "../sfx/sfx-event-definition";
import type { AudioSpatialDefinition } from "../spatial/spatial-types";
import type { AudioCatalogDefinition, CompiledAudioCatalog } from "./audio-catalog";
import type { AudioParameterDefinition, AudioParameterValue } from "./parameter-definition";
import type {
  AudioClipDefinition,
  AudioMarkerDefinition,
  AudioSourceDefinition,
  AudioValueRange
} from "./source-definition";
import {
  finite,
  nonNegative,
  positive,
  positiveInteger,
  unitInterval,
  validateParameterValue
} from "./validation";

const STANDARD_BUSES: AudioBusDefinition[] = [
  { id: "master" },
  { id: "music", parentId: "master" },
  { id: "sfx", parentId: "master" },
  { id: "sfx/ui", parentId: "sfx" },
  { id: "sfx/ambience", parentId: "sfx" },
  { id: "dialogue", parentId: "master" }
];

export function compileAudioCatalog(input: AudioCatalogDefinition): CompiledAudioCatalog {
  const buses = compileBuses(input.buses ?? []);
  const parameters = registry((input.parameters ?? []).map(compileParameter), "parameter");
  const concurrency = registry((input.concurrency ?? []).map(compileConcurrency), "concurrency");
  const mixSnapshots = registry(
    (input.mixSnapshots ?? []).map((snapshot) => compileMixSnapshot(snapshot, buses)),
    "mix snapshot"
  );
  const music = registry(
    (input.music ?? []).map((track) => compileMusic(track, buses)),
    "music track"
  );
  const sfx = registry(
    (input.sfx ?? []).map((event) => compileSfx(event, buses, concurrency, parameters)),
    "SFX event"
  );
  const dialogue = registry(
    (input.dialogue ?? []).map((line) => compileDialogue(line, buses, mixSnapshots)),
    "dialogue line"
  );
  return {
    music,
    sfx,
    dialogue,
    concurrency,
    buses,
    parameters,
    mixSnapshots,
    globalParameters: Object.fromEntries(
      [...parameters.values()]
        .filter((parameter) => parameter.scope === "global")
        .map((parameter) => [parameter.id, parameter.defaultValue])
    )
  };
}

function compileBuses(
  definitions: AudioBusDefinition[]
): Map<string, Required<Pick<AudioBusDefinition, "id">> & AudioBusDefinition> {
  const buses = new Map<string, Required<Pick<AudioBusDefinition, "id">> & AudioBusDefinition>();
  for (const definition of [...STANDARD_BUSES, ...definitions]) {
    requireId(definition.id, "bus");
    const standard = STANDARD_BUSES.find((entry) => entry.id === definition.id);
    if (buses.has(definition.id) && standard === undefined) {
      throw duplicate("bus", definition.id);
    }
    const previous = buses.get(definition.id);
    buses.set(definition.id, {
      id: definition.id,
      ...((definition.parentId ?? previous?.parentId) === undefined
        ? {}
        : { parentId: definition.parentId ?? previous?.parentId }),
      volume: unitInterval(definition.volume ?? previous?.volume, 1, "bus volume"),
      muted: definition.muted ?? previous?.muted ?? false,
      paused: definition.paused ?? previous?.paused ?? false,
      ...((definition.maxPlaybackInstances ?? previous?.maxPlaybackInstances) === undefined
        ? {}
        : {
            maxPlaybackInstances: positiveInteger(
              definition.maxPlaybackInstances ?? previous?.maxPlaybackInstances,
              1,
              "bus maxPlaybackInstances"
            )
          })
    });
  }
  for (const bus of buses.values()) {
    if (bus.parentId !== undefined && !buses.has(bus.parentId)) {
      throw createAudioError("audio.bus_missing", `Audio parent bus is missing: ${bus.parentId}`, {
        busId: bus.id,
        parentId: bus.parentId
      });
    }
  }
  for (const bus of buses.values()) {
    const visited = new Set<string>();
    let current: AudioBusDefinition | undefined = bus;
    while (current !== undefined) {
      if (visited.has(current.id)) {
        throw createAudioError(
          "audio.bus_cycle",
          `Audio bus hierarchy contains a cycle: ${bus.id}`
        );
      }
      visited.add(current.id);
      current = current.parentId === undefined ? undefined : buses.get(current.parentId);
    }
  }
  return buses;
}

function compileMusic(
  definition: MusicTrackDefinition,
  buses: Map<string, AudioBusDefinition>
): MusicTrackDefinition {
  requireId(definition.id, "music track");
  requireBus(definition.bus ?? "music", buses, definition.id);
  const stemIds = new Set<string>();
  return {
    id: definition.id,
    source: compileSource(definition.source, `${definition.id}:main`),
    stems: (definition.stems ?? []).map((stem) => {
      requireUnique(stemIds, stem.id, "music stem");
      if (stem.intensity !== undefined) {
        const min = unitInterval(stem.intensity.min, 0, "music stem intensity min");
        const max = unitInterval(stem.intensity.max, 1, "music stem intensity max");
        if (min > max) {
          throw createAudioError(
            "audio.invalid_config",
            `Audio music stem intensity min cannot exceed max: ${definition.id}:${stem.id}`
          );
        }
      }
      return {
        id: stem.id,
        source: compileSource(stem.source, `${definition.id}:${stem.id}`),
        volume: unitInterval(stem.volume, 1, "music stem volume"),
        ...(stem.intensity === undefined
          ? {}
          : { intensity: { min: stem.intensity.min, max: stem.intensity.max } })
      };
    }),
    bus: definition.bus ?? "music",
    volume: unitInterval(definition.volume, 1, "music volume"),
    pitch: positive(definition.pitch, 1, "music pitch"),
    loop: definition.loop ?? true,
    ...(definition.bpm === undefined ? {} : { bpm: positive(definition.bpm, 1, "music bpm") }),
    ...(definition.beatsPerBar === undefined
      ? {}
      : { beatsPerBar: positiveInteger(definition.beatsPerBar, 4, "music beatsPerBar") }),
    markers: compileMarkers(definition.markers ?? [], `${definition.id}:marker`),
    ...(definition.defaultTransition === undefined
      ? {}
      : { defaultTransition: compileTransition(definition.defaultTransition) }),
    tags: uniqueStrings(definition.tags ?? [], "music tags")
  };
}

function compileSfx(
  definition: SfxEventDefinition,
  buses: Map<string, AudioBusDefinition>,
  concurrency: Map<string, SfxConcurrencyDefinition>,
  parameters: Map<string, AudioParameterDefinition>
): SfxEventDefinition {
  requireId(definition.id, "SFX event");
  const hasLayers = (definition.layers?.length ?? 0) > 0;
  const hasBackendObject = (definition.backendObject?.length ?? 0) > 0;
  if (hasLayers === hasBackendObject) {
    throw createAudioError(
      "audio.invalid_config",
      `SFX event requires exactly one playback source: ${definition.id}`
    );
  }
  requireBus(definition.bus ?? "sfx", buses, definition.id);
  const concurrencyIds = uniqueStrings(definition.concurrency ?? [], "SFX concurrency");
  for (const id of concurrencyIds) {
    if (!concurrency.has(id)) {
      throw createAudioError("audio.concurrency_missing", `Audio concurrency is missing: ${id}`, {
        eventId: definition.id,
        concurrencyId: id
      });
    }
  }
  const parameterValues: Record<string, AudioParameterValue> = {};
  for (const [id, value] of Object.entries(definition.parameters ?? {})) {
    const parameter = parameters.get(id);
    if (parameter === undefined || parameter.scope !== "instance") {
      throw createAudioError("audio.parameter_missing", `Audio parameter is missing: ${id}`, {
        eventId: definition.id,
        parameterId: id
      });
    }
    parameterValues[id] = validateParameterValue(parameter, value);
  }
  const layerIds = new Set<string>();
  return {
    id: definition.id,
    layers: (definition.layers ?? []).map((layer) =>
      compileSfxLayer(definition.id, layer, layerIds)
    ),
    ...(definition.backendObject === undefined ? {} : { backendObject: definition.backendObject }),
    bus: definition.bus ?? "sfx",
    volume: compileRange(definition.volume, "SFX volume", true),
    pitch: compileRange(definition.pitch, "SFX pitch", false),
    priority: finite(definition.priority, 0, "SFX priority"),
    loop: definition.loop ?? false,
    ...(definition.spatial === undefined ? {} : { spatial: compileSpatial(definition.spatial) }),
    concurrency: concurrencyIds,
    parameters: parameterValues,
    tags: uniqueStrings(definition.tags ?? [], "SFX tags")
  };
}

function compileSfxLayer(
  eventId: string,
  layer: SfxEventLayerDefinition,
  layerIds: Set<string>
): SfxEventLayerDefinition {
  requireUnique(layerIds, layer.id, "SFX layer");
  if (layer.clips.length === 0) {
    throw createAudioError(
      "audio.invalid_config",
      `Audio SFX layer requires at least one clip: ${eventId}:${layer.id}`
    );
  }
  const clipIds = new Set<string>();
  return {
    id: layer.id,
    clips: layer.clips.map((clip) => compileClip(clip, clipIds, `${eventId}:${layer.id}`)),
    selection: layer.selection ?? "random",
    probability: unitInterval(layer.probability, 1, "SFX layer probability"),
    volume: compileRange(layer.volume, "SFX layer volume", true),
    pitch: compileRange(layer.pitch, "SFX layer pitch", false)
  };
}

function compileDialogue(
  definition: DialogueLineDefinition,
  buses: Map<string, AudioBusDefinition>,
  snapshots: Map<string, AudioMixSnapshotDefinition>
): DialogueLineDefinition {
  requireId(definition.id, "dialogue line");
  requireBus(definition.bus ?? "dialogue", buses, definition.id);
  if (definition.duckingSnapshotId !== undefined && !snapshots.has(definition.duckingSnapshotId)) {
    throw createAudioError(
      "audio.snapshot_missing",
      `Dialogue ducking snapshot is missing: ${definition.duckingSnapshotId}`,
      { lineId: definition.id, snapshotId: definition.duckingSnapshotId }
    );
  }
  return {
    id: definition.id,
    source: compileSource(definition.source, definition.id),
    ...(definition.speakerId === undefined ? {} : { speakerId: definition.speakerId }),
    ...(definition.subtitleKey === undefined ? {} : { subtitleKey: definition.subtitleKey }),
    markers: compileMarkers(definition.markers ?? [], `${definition.id}:marker`),
    bus: definition.bus ?? "dialogue",
    priority: finite(definition.priority, 0, "dialogue priority"),
    interrupt: definition.interrupt ?? "queue",
    ...(definition.duckingSnapshotId === undefined
      ? {}
      : { duckingSnapshotId: definition.duckingSnapshotId }),
    ...(definition.spatial === undefined ? {} : { spatial: compileSpatial(definition.spatial) }),
    tags: uniqueStrings(definition.tags ?? [], "dialogue tags")
  };
}

function compileSource(definition: AudioSourceDefinition, ownerId: string): AudioSourceDefinition {
  if (definition.kind === "backend") {
    if (!definition.key) {
      throw createAudioError(
        "audio.invalid_config",
        `Audio backend source key is required: ${ownerId}`
      );
    }
    return { kind: "backend", key: definition.key };
  }
  if (definition.clips.length === 0) {
    throw createAudioError("audio.invalid_config", `Audio source requires clips: ${ownerId}`);
  }
  const clipIds = new Set<string>();
  return {
    kind: "asset",
    clips: definition.clips.map((clip) => compileClip(clip, clipIds, ownerId))
  };
}

function compileClip(
  clip: AudioClipDefinition,
  clipIds: Set<string>,
  ownerId: string
): AudioClipDefinition {
  requireUnique(clipIds, clip.id, "audio clip");
  if (!clip.asset.assetId || clip.asset.type !== "audio") {
    throw createAudioError(
      "audio.invalid_config",
      `Audio clip asset is invalid: ${ownerId}:${clip.id}`
    );
  }
  return {
    id: clip.id,
    asset: { ...clip.asset },
    weight: positive(clip.weight, 1, "audio clip weight"),
    volume: compileRange(clip.volume, "audio clip volume", true),
    pitch: compileRange(clip.pitch, "audio clip pitch", false),
    loop: clip.loop ?? false,
    startOffsetMs: nonNegative(clip.startOffsetMs, 0, "audio clip startOffsetMs")
  };
}

function compileParameter(definition: AudioParameterDefinition): AudioParameterDefinition {
  requireId(definition.id, "parameter");
  switch (definition.kind) {
    case "continuous": {
      const min = finite(definition.min, 0, "parameter min");
      const max = finite(definition.max, 1, "parameter max");
      if (min > max) {
        throw createAudioError(
          "audio.invalid_config",
          `Audio parameter min cannot exceed max: ${definition.id}`
        );
      }
      return {
        ...definition,
        min,
        max,
        defaultValue: validateParameterValue(
          { ...definition, min, max },
          definition.defaultValue
        ) as number
      };
    }
    case "discrete": {
      const values = uniqueStrings(definition.values, "parameter values");
      if (values.length === 0 || !values.includes(definition.defaultValue)) {
        throw createAudioError(
          "audio.invalid_config",
          `Audio discrete parameter default is invalid: ${definition.id}`
        );
      }
      return { ...definition, values };
    }
    case "boolean":
      return { ...definition };
  }
}

function compileConcurrency(definition: SfxConcurrencyDefinition): SfxConcurrencyDefinition {
  requireId(definition.id, "concurrency");
  return {
    id: definition.id,
    maxInstances: positiveInteger(definition.maxInstances, 1, "concurrency maxInstances"),
    scope: definition.scope ?? "global",
    resolution: definition.resolution ?? "stop-lowest-priority",
    retriggerMs: nonNegative(definition.retriggerMs, 0, "concurrency retriggerMs")
  };
}

function compileMixSnapshot(
  definition: AudioMixSnapshotDefinition,
  buses: Map<string, AudioBusDefinition>
): AudioMixSnapshotDefinition {
  requireId(definition.id, "mix snapshot");
  const busIds = new Set<string>();
  return {
    id: definition.id,
    priority: finite(definition.priority, 0, "mix snapshot priority"),
    buses: definition.buses.map((override) => {
      requireUnique(busIds, override.busId, "mix snapshot bus");
      requireBus(override.busId, buses, definition.id);
      return {
        busId: override.busId,
        ...(override.volume === undefined
          ? {}
          : { volume: unitInterval(override.volume, 1, "mix snapshot volume") }),
        ...(override.muted === undefined ? {} : { muted: override.muted }),
        ...(override.paused === undefined ? {} : { paused: override.paused })
      };
    })
  };
}

function compileSpatial(definition: AudioSpatialDefinition): AudioSpatialDefinition {
  const minDistance = nonNegative(definition.minDistance, 0, "spatial minDistance");
  const maxDistance = positive(definition.maxDistance, 1, "spatial maxDistance");
  if (minDistance > maxDistance) {
    throw createAudioError(
      "audio.invalid_config",
      "Audio spatial minDistance cannot exceed maxDistance"
    );
  }
  return {
    minDistance,
    maxDistance,
    rolloff: definition.rolloff ?? "inverse",
    rolloffFactor: positive(definition.rolloffFactor, 1, "spatial rolloffFactor"),
    distanceCulling: definition.distanceCulling ?? true
  };
}

function compileTransition(transition: MusicTransition): MusicTransition {
  switch (transition.type) {
    case "cut":
      return { type: "cut" };
    case "fade":
      return {
        type: "fade",
        fadeOutMs: nonNegative(transition.fadeOutMs, 0, "music fadeOutMs"),
        fadeInMs: nonNegative(transition.fadeInMs, transition.fadeOutMs, "music fadeInMs")
      };
    case "crossfade":
      return {
        type: "crossfade",
        durationMs: nonNegative(transition.durationMs, 0, "music crossfade durationMs")
      };
  }
}

function compileMarkers(
  markers: AudioMarkerDefinition[],
  ownerId: string
): AudioMarkerDefinition[] {
  const ids = new Set<string>();
  return markers
    .map((marker) => {
      requireUnique(ids, marker.id, "audio marker");
      return {
        id: marker.id,
        positionMs: nonNegative(marker.positionMs, 0, `${ownerId} positionMs`)
      };
    })
    .sort((left, right) => left.positionMs - right.positionMs || left.id.localeCompare(right.id));
}

function compileRange(
  value: AudioValueRange | undefined,
  label: string,
  allowZero: boolean
): AudioValueRange {
  const validate = (candidate: number): number =>
    allowZero ? nonNegative(candidate, 1, label) : positive(candidate, 1, label);
  if (value === undefined) {
    return 1;
  }
  if (typeof value === "number") {
    return validate(value);
  }
  const min = validate(value.min);
  const max = validate(value.max);
  if (min > max) {
    throw createAudioError("audio.invalid_config", `Audio ${label} min cannot exceed max`);
  }
  return { min, max };
}

function requireBus(busId: string, buses: Map<string, AudioBusDefinition>, sourceId: string): void {
  if (!buses.has(busId)) {
    throw createAudioError("audio.bus_missing", `Audio bus is missing: ${busId}`, {
      busId,
      sourceId
    });
  }
}

function registry<T extends { id: string }>(values: T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    requireId(value.id, label);
    if (result.has(value.id)) {
      throw duplicate(label, value.id);
    }
    result.set(value.id, value);
  }
  return result;
}

function requireUnique(values: Set<string>, id: string, label: string): void {
  requireId(id, label);
  if (values.has(id)) {
    throw duplicate(label, id);
  }
  values.add(id);
}

function requireId(id: string, label: string): void {
  if (!id) {
    throw createAudioError(
      "audio.duplicate_definition",
      `Audio ${label} id must be non-empty and unique`,
      { id }
    );
  }
}

function duplicate(label: string, id: string) {
  return createAudioError(
    "audio.duplicate_definition",
    `Duplicate audio ${label} definition: ${id}`,
    { id }
  );
}

function uniqueStrings(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    requireUnique(seen, value, label);
    result.push(value);
  }
  return result;
}
