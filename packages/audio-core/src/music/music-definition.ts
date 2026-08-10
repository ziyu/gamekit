import type { AudioMarkerDefinition, AudioSourceDefinition } from "../catalog/source-definition";
import type { AudioBusId, MusicTrackId } from "../contracts/identifiers";

export type MusicTransition =
  | { type: "cut" }
  | { type: "fade"; fadeOutMs: number; fadeInMs?: number | undefined }
  | { type: "crossfade"; durationMs: number };

export type MusicStemDefinition = {
  id: string;
  source: AudioSourceDefinition;
  volume?: number | undefined;
  intensity?: { min: number; max: number } | undefined;
};

export type MusicTrackDefinition = {
  id: MusicTrackId;
  source: AudioSourceDefinition;
  stems?: MusicStemDefinition[] | undefined;
  bus?: AudioBusId | undefined;
  volume?: number | undefined;
  pitch?: number | undefined;
  loop?: boolean | undefined;
  bpm?: number | undefined;
  beatsPerBar?: number | undefined;
  markers?: AudioMarkerDefinition[] | undefined;
  defaultTransition?: MusicTransition | undefined;
  tags?: string[] | undefined;
};

export type MusicProgramDefinition = MusicTrackDefinition & {
  source: Extract<AudioSourceDefinition, { kind: "backend" }>;
};
