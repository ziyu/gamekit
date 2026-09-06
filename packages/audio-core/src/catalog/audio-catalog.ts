import type { DialogueLineDefinition } from "../dialogue/dialogue-line-definition";
import type { AudioMixSnapshotDefinition, AudioBusDefinition } from "../mix/mix-types";
import type { MusicTrackDefinition } from "../music/music-definition";
import type { SfxConcurrencyDefinition, SfxEventDefinition } from "../sfx/sfx-event-definition";
import type { AudioParameterDefinition, AudioParameterValue } from "./parameter-definition";

export type AudioCatalogDefinition = {
  music?: MusicTrackDefinition[] | undefined;
  sfx?: SfxEventDefinition[] | undefined;
  dialogue?: DialogueLineDefinition[] | undefined;
  concurrency?: SfxConcurrencyDefinition[] | undefined;
  buses?: AudioBusDefinition[] | undefined;
  parameters?: AudioParameterDefinition[] | undefined;
  mixSnapshots?: AudioMixSnapshotDefinition[] | undefined;
};

export type CompiledAudioCatalog = {
  music: Map<string, MusicTrackDefinition>;
  sfx: Map<string, SfxEventDefinition>;
  dialogue: Map<string, DialogueLineDefinition>;
  concurrency: Map<string, SfxConcurrencyDefinition>;
  buses: Map<string, Required<Pick<AudioBusDefinition, "id">> & AudioBusDefinition>;
  parameters: Map<string, AudioParameterDefinition>;
  mixSnapshots: Map<string, AudioMixSnapshotDefinition>;
  globalParameters: Record<string, AudioParameterValue>;
};
