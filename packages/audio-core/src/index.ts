export type { AudioCatalogDefinition } from "./catalog/audio-catalog";
export type { AudioParameterDefinition, AudioParameterValue } from "./catalog/parameter-definition";
export type {
  AudioClipRef,
  AudioMarkerDefinition,
  AudioSourceDefinition,
  AudioValueRange,
  ResolvedAudioTrack
} from "./catalog/source-definition";
export { createGameAudio } from "./composition/create-game-audio";
export type { CreateGameAudioOptions } from "./composition/create-game-audio";
export type { GameAudio } from "./contracts/game-audio";
export type {
  AudioBusId,
  AudioEmitterId,
  AudioListenerId,
  AudioOwnerId,
  AudioParameterId,
  DialogueHandleId,
  DialogueLineId,
  MusicTrackId,
  PlaybackInstanceId,
  SfxEventId,
  SpeakerId
} from "./contracts/identifiers";
export type { AudioOutputState, AudioUnlockState, FadeOptions } from "./contracts/lifecycle";
export type {
  PlaybackCategory,
  PlaybackBudget,
  PlaybackBudgets,
  PlaybackHandle,
  PlaybackInstanceState,
  PlaybackPatch,
  PlaybackStatus,
  PlaybackTarget
} from "./contracts/playback";
export type {
  DialogueInterruptPolicy,
  DialogueLineDefinition
} from "./dialogue/dialogue-line-definition";
export type {
  DialogueHandle,
  DialoguePlayOptions,
  DialoguePlayer,
  DialogueQueueOptions
} from "./dialogue/dialogue-player";
export type {
  DialogueItemState,
  DialogueItemStatus,
  DialogueState
} from "./dialogue/dialogue-state";
export type {
  AudioBusDefinition,
  AudioBusState,
  AudioMixActivationState,
  AudioMixBusOverride,
  AudioMixer,
  AudioMixerSnapshot,
  AudioMixSnapshotDefinition
} from "./mix/mix-types";
export type {
  MusicStemDefinition,
  MusicProgramDefinition,
  MusicTrackDefinition,
  MusicTransition
} from "./music/music-definition";
export type { MusicPlayer, MusicPlayOptions } from "./music/music-player";
export type { MusicPlaybackStatus, MusicState, MusicTransitionState } from "./music/music-state";
export type { AudioDiagnosticEntry } from "./observability/audio-diagnostics";
export type { GameAudioSnapshot } from "./observability/audio-snapshot";
export type { GameAudioEvent } from "./observability/lifecycle-events";
export type {
  SfxConcurrencyDefinition,
  SfxConcurrencyResolution,
  SfxConcurrencyScope,
  SfxEventDefinition,
  SfxEventLayerDefinition,
  SfxLayerSelectionMode
} from "./sfx/sfx-event-definition";
export type {
  SfxPlayOptions,
  SfxPlayRejectionReason,
  SfxPlayResult,
  SoundEffects,
  SoundEffectsSnapshot
} from "./sfx/sound-effects";
export type {
  AudioEmitterState,
  AudioListenerState,
  AudioPoint,
  AudioRolloffModel,
  AudioSpatialDefinition,
  AudioTransform,
  RemoveEmitterOptions,
  SpatialAudio
} from "./spatial/spatial-types";
