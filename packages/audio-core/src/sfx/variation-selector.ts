import type { ResolvedAudioTrack } from "../catalog/source-definition";
import { sampleRange } from "../catalog/validation";
import type { SfxEventDefinition, SfxEventLayerDefinition } from "./sfx-event-definition";

export type SfxVariationState = {
  sequence: Map<string, number>;
  previous: Map<string, string>;
};

export function selectSfxTracks(
  event: SfxEventDefinition,
  random: () => number,
  state: SfxVariationState
): ResolvedAudioTrack[] {
  if (event.backendObject !== undefined) {
    return [];
  }
  const tracks: ResolvedAudioTrack[] = [];
  for (const layer of event.layers ?? []) {
    if (unitRandom(random) > (layer.probability ?? 1)) {
      continue;
    }
    const key = `${event.id}:${layer.id}`;
    const clip = selectClip(layer, key, random, state);
    tracks.push({
      id: `${event.id}:${layer.id}:${clip.id}`,
      asset: { ...clip.asset },
      volume:
        sampleRange(event.volume, 1, random) *
        sampleRange(layer.volume, 1, random) *
        sampleRange(clip.volume, 1, random),
      pitch:
        sampleRange(event.pitch, 1, random) *
        sampleRange(layer.pitch, 1, random) *
        sampleRange(clip.pitch, 1, random),
      loop: clip.loop ?? event.loop ?? false,
      startOffsetMs: clip.startOffsetMs ?? 0
    });
  }
  return tracks;
}

function selectClip(
  layer: SfxEventLayerDefinition,
  key: string,
  random: () => number,
  state: SfxVariationState
) {
  switch (layer.selection ?? "random") {
    case "sequence": {
      const index = state.sequence.get(key) ?? 0;
      state.sequence.set(key, index + 1);
      return layer.clips[index % layer.clips.length] as (typeof layer.clips)[number];
    }
    case "random-no-repeat": {
      const previous = state.previous.get(key);
      const candidates =
        layer.clips.length <= 1
          ? layer.clips
          : layer.clips.filter((candidate) => candidate.id !== previous);
      const selected = weighted(candidates, random);
      state.previous.set(key, selected.id);
      return selected;
    }
    case "random":
      return weighted(layer.clips, random);
  }
}

function weighted<T extends { weight?: number | undefined }>(values: T[], random: () => number): T {
  const total = values.reduce((sum, value) => sum + (value.weight ?? 1), 0);
  let cursor = unitRandom(random) * total;
  for (const value of values) {
    cursor -= value.weight ?? 1;
    if (cursor <= 0) {
      return value;
    }
  }
  return values[values.length - 1] as T;
}

function unitRandom(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
