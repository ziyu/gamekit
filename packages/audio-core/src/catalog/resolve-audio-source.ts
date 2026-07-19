import type { AudioSourceDefinition, ResolvedAudioTrack } from "./source-definition";
import { sampleRange } from "./validation";

export type ResolvedAudioSource = {
  tracks: ResolvedAudioTrack[];
  backendObject?: string | undefined;
};

export function resolveAudioSource(
  source: AudioSourceDefinition,
  prefix: string,
  random: () => number,
  options: {
    volume?: number | undefined;
    pitch?: number | undefined;
    loop?: boolean | undefined;
  } = {}
): ResolvedAudioSource {
  if (source.kind === "backend") {
    return { tracks: [], backendObject: source.key };
  }
  return {
    tracks: source.clips.map((clip) => ({
      id: `${prefix}:${clip.id}`,
      asset: { ...clip.asset },
      volume: sampleRange(clip.volume, 1, random) * (options.volume ?? 1),
      pitch: sampleRange(clip.pitch, 1, random) * (options.pitch ?? 1),
      loop: options.loop ?? clip.loop ?? false,
      startOffsetMs: clip.startOffsetMs ?? 0
    }))
  };
}
