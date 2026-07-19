import type { AudioMarkerDefinition, AudioSourceDefinition } from "../catalog/source-definition";
import type { AudioBusId, DialogueLineId, SpeakerId } from "../contracts/identifiers";
import type { AudioSpatialDefinition } from "../spatial/spatial-types";

export type DialogueInterruptPolicy = "queue" | "replace-current" | "reject";

export type DialogueLineDefinition = {
  id: DialogueLineId;
  source: AudioSourceDefinition;
  speakerId?: SpeakerId | undefined;
  subtitleKey?: string | undefined;
  markers?: AudioMarkerDefinition[] | undefined;
  bus?: AudioBusId | undefined;
  priority?: number | undefined;
  interrupt?: DialogueInterruptPolicy | undefined;
  duckingSnapshotId?: string | undefined;
  spatial?: AudioSpatialDefinition | undefined;
  tags?: string[] | undefined;
};
