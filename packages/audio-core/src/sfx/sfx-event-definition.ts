import type { AudioParameterValue } from "../catalog/parameter-definition";
import type { AudioClipDefinition, AudioValueRange } from "../catalog/source-definition";
import type { AudioBusId, SfxEventId } from "../contracts/identifiers";
import type { AudioSpatialDefinition } from "../spatial/spatial-types";

export type SfxLayerSelectionMode = "random" | "random-no-repeat" | "sequence";

export type SfxEventLayerDefinition = {
  id: string;
  clips: AudioClipDefinition[];
  selection?: SfxLayerSelectionMode | undefined;
  probability?: number | undefined;
  volume?: AudioValueRange | undefined;
  pitch?: AudioValueRange | undefined;
};

export type SfxEventDefinition = {
  id: SfxEventId;
  layers?: SfxEventLayerDefinition[] | undefined;
  backendObject?: string | undefined;
  bus?: AudioBusId | undefined;
  volume?: AudioValueRange | undefined;
  pitch?: AudioValueRange | undefined;
  priority?: number | undefined;
  loop?: boolean | undefined;
  spatial?: AudioSpatialDefinition | undefined;
  concurrency?: string[] | undefined;
  parameters?: Record<string, AudioParameterValue> | undefined;
  tags?: string[] | undefined;
};

export type SfxConcurrencyScope = "global" | "owner" | "emitter";

export type SfxConcurrencyResolution =
  | "reject-new"
  | "stop-oldest"
  | "stop-quietest"
  | "stop-lowest-priority";

export type SfxConcurrencyDefinition = {
  id: string;
  maxInstances: number;
  scope?: SfxConcurrencyScope | undefined;
  resolution?: SfxConcurrencyResolution | undefined;
  retriggerMs?: number | undefined;
};
