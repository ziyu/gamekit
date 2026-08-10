import type { DialoguePlayer } from "../dialogue/dialogue-player";
import type { AudioMixer } from "../mix/mix-types";
import type { MusicPlayer } from "../music/music-player";
import type { AudioDiagnosticEntry } from "../observability/audio-diagnostics";
import type { GameAudioSnapshot } from "../observability/audio-snapshot";
import type { GameAudioEvent } from "../observability/lifecycle-events";
import type { SoundEffects } from "../sfx/sound-effects";
import type { SpatialAudio } from "../spatial/spatial-types";

export interface GameAudio {
  readonly music: MusicPlayer;
  readonly sfx: SoundEffects;
  readonly dialogue?: DialoguePlayer | undefined;
  readonly mix: AudioMixer;
  readonly spatial: SpatialAudio;
  unlock(): Promise<boolean>;
  suspend(): void;
  resume(): void;
  update(deltaMs: number, elapsedMs?: number): void;
  subscribe(listener: (event: GameAudioEvent) => void): () => void;
  diagnostics(): AudioDiagnosticEntry[];
  snapshot(): GameAudioSnapshot;
  dispose(): void;
}
