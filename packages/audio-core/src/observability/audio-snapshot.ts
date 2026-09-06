import type { AudioBackendSnapshot } from "../backend/backend-requests";
import type { AudioOutputState, AudioUnlockState } from "../contracts/lifecycle";
import type { PlaybackInstanceState } from "../contracts/playback";
import type { DialogueState } from "../dialogue/dialogue-state";
import type { AudioMixerSnapshot } from "../mix/mix-types";
import type { MusicState } from "../music/music-state";
import type { SoundEffectsSnapshot } from "../sfx/sound-effects";
import type { AudioEmitterState, AudioListenerState } from "../spatial/spatial-types";

export type GameAudioSnapshot = {
  id: string;
  elapsed: number;
  disposed: boolean;
  unlock: AudioUnlockState;
  output: AudioOutputState;
  music: MusicState;
  sfx: SoundEffectsSnapshot;
  dialogue?: DialogueState | undefined;
  mix: AudioMixerSnapshot;
  spatial: {
    listeners: AudioListenerState[];
    emitters: AudioEmitterState[];
  };
  playback: PlaybackInstanceState[];
  activePlaybackInstances: number;
  nativePlaybackCount: number;
  diagnostics: number;
  backend: AudioBackendSnapshot;
};
