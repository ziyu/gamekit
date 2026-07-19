import type { AudioBackend } from "../backend/audio-backend";
import type { AudioCatalogDefinition } from "../catalog/audio-catalog";
import { compileAudioCatalog } from "../catalog/compile-audio-catalog";
import { nonNegativeInteger } from "../catalog/validation";
import { createAudioError } from "../contracts/errors";
import type { GameAudio } from "../contracts/game-audio";
import type { AudioOutputState, AudioUnlockState } from "../contracts/lifecycle";
import type { PlaybackBudgets } from "../contracts/playback";
import { createDialoguePlayer } from "../dialogue/create-dialogue-player";
import { createAudioMixer } from "../mix/audio-mixer";
import { createMusicPlayer } from "../music/create-music-player";
import {
  createAudioDiagnosticSink,
  type AudioDiagnosticEntry
} from "../observability/audio-diagnostics";
import type { GameAudioEvent } from "../observability/lifecycle-events";
import {
  createPlaybackCoordinator,
  type PlaybackCoordinator
} from "../playback/playback-coordinator";
import { createSoundEffects } from "../sfx/create-sound-effects";
import { createSpatialAudio } from "../spatial/spatial-audio";

export type CreateGameAudioOptions = AudioCatalogDefinition & {
  id?: string | undefined;
  backend: AudioBackend;
  disposeBackend?: boolean | undefined;
  maxPlaybackInstances?: number | undefined;
  maxNativePlaybackCount?: number | undefined;
  playbackBudgets?: PlaybackBudgets | undefined;
  maxDedupeEntries?: number | undefined;
  dedupeWindowMs?: number | undefined;
  diagnosticLimit?: number | undefined;
  random?: (() => number) | undefined;
  onEvent?: ((event: GameAudioEvent) => void) | undefined;
  onEventError?: ((error: unknown, event: GameAudioEvent) => void) | undefined;
  onDiagnostic?: ((entry: AudioDiagnosticEntry) => void) | undefined;
  onDiagnosticError?: ((error: unknown, entry: AudioDiagnosticEntry) => void) | undefined;
};

export function createGameAudio(options: CreateGameAudioOptions): GameAudio {
  const id = options.id ?? "audio";
  const catalog = compileAudioCatalog(options);
  const random = options.random ?? Math.random;
  const dialogueEnabled = options.dialogue !== undefined;
  let elapsed = 0;
  let disposed = false;
  let unlockState: AudioUnlockState = "locked";
  let outputState: AudioOutputState = "running";
  let unlockAttempt: Promise<boolean> | undefined;
  let playback: PlaybackCoordinator | undefined;
  const diagnostics = createAudioDiagnosticSink({
    limit: nonNegativeInteger(options.diagnosticLimit, 256, "diagnosticLimit"),
    clock: () => elapsed,
    ...(options.onDiagnostic === undefined ? {} : { onEntry: options.onDiagnostic }),
    ...(options.onDiagnosticError === undefined ? {} : { onEntryError: options.onDiagnosticError })
  });
  const mixer = createAudioMixer({
    catalog,
    backend: options.backend,
    diagnostics,
    clock: () => elapsed
  });
  const spatial = createSpatialAudio({
    backend: options.backend,
    diagnostics,
    onRemoveEmitter(emitterId, removeOptions) {
      if (removeOptions.stopPlayback === true) {
        playback?.stop({ emitterId }, removeOptions.fadeMs);
      }
    }
  });
  playback = createPlaybackCoordinator({
    backend: options.backend,
    mixer,
    spatial,
    diagnostics,
    clock: () => elapsed,
    ...(options.maxPlaybackInstances === undefined
      ? {}
      : { maxPlaybackInstances: options.maxPlaybackInstances }),
    ...(options.maxNativePlaybackCount === undefined
      ? {}
      : { maxNativePlaybackCount: options.maxNativePlaybackCount }),
    ...(options.playbackBudgets === undefined ? {} : { budgets: options.playbackBudgets }),
    ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    ...(options.onEventError === undefined ? {} : { onEventError: options.onEventError })
  });
  const playbackController = playback;
  const sfx = createSoundEffects({
    catalog,
    playback: playbackController,
    spatial,
    diagnostics,
    clock: () => elapsed,
    random,
    ...(options.maxDedupeEntries === undefined
      ? {}
      : { maxDedupeEntries: options.maxDedupeEntries }),
    ...(options.dedupeWindowMs === undefined ? {} : { dedupeWindowMs: options.dedupeWindowMs })
  });
  const music = createMusicPlayer({
    catalog,
    playback: playbackController,
    diagnostics,
    clock: () => elapsed,
    random
  });
  const dialogue = dialogueEnabled
    ? createDialoguePlayer({
        catalog,
        playback: playbackController,
        mixer,
        diagnostics,
        clock: () => elapsed,
        random
      })
    : undefined;

  const audio: GameAudio = {
    music,
    sfx,
    ...(dialogue === undefined ? {} : { dialogue }),
    mix: mixer,
    spatial,
    async unlock() {
      requireActive();
      if (unlockState === "unlocked") {
        return true;
      }
      if (unlockAttempt !== undefined) {
        return unlockAttempt;
      }
      unlockState = "unlocking";
      const attempt = Promise.resolve(options.backend.unlock())
        .then((unlocked) => {
          if (disposed) {
            return false;
          }
          unlockState = unlocked ? "unlocked" : "failed";
          diagnostics.push(unlocked ? "audio.unlocked" : "audio.unlock_failed");
          return unlocked;
        })
        .catch((error: unknown) => {
          if (!disposed) {
            unlockState = "failed";
            diagnostics.push("audio.unlock_failed", {
              message: error instanceof Error ? error.message : String(error)
            });
          }
          return false;
        })
        .finally(() => {
          if (unlockAttempt === attempt) {
            unlockAttempt = undefined;
          }
        });
      unlockAttempt = attempt;
      return attempt;
    },
    suspend() {
      requireActive();
      if (outputState === "suspended") {
        return;
      }
      options.backend.suspend();
      outputState = "suspended";
      diagnostics.push("audio.output_suspended");
    },
    resume() {
      requireActive();
      if (outputState === "running") {
        return;
      }
      options.backend.resumeOutput();
      outputState = "running";
      diagnostics.push("audio.output_resumed");
    },
    update(deltaMs, elapsedMs) {
      requireActive();
      elapsed = elapsedMs === undefined ? elapsed + Math.max(0, deltaMs) : Math.max(0, elapsedMs);
      mixer.update(elapsed);
      playbackController.update(deltaMs, elapsed);
      sfx.update(elapsed);
      music.update(elapsed);
    },
    subscribe: (listener) => playbackController.subscribe(listener),
    diagnostics: () => diagnostics.entries(),
    snapshot() {
      const playbackSnapshot = playbackController.snapshot();
      return {
        id,
        elapsed,
        disposed,
        unlock: unlockState,
        output: outputState,
        music: music.getState(),
        sfx: sfx.snapshot(),
        ...(dialogue === undefined ? {} : { dialogue: dialogue.getState() }),
        mix: mixer.snapshot(),
        spatial: {
          listeners: spatial.listeners(),
          emitters: spatial.emitters()
        },
        playback: playbackSnapshot.instances,
        activePlaybackInstances: playbackSnapshot.activePlaybackInstances,
        nativePlaybackCount: playbackSnapshot.nativePlaybackCount,
        diagnostics: diagnostics.count(),
        backend: options.backend.snapshot()
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      dialogue?.dispose();
      music.dispose();
      sfx.dispose();
      playbackController.dispose();
      mixer.dispose();
      spatial.dispose();
      if (options.disposeBackend ?? true) {
        options.backend.dispose();
      }
      unlockState = "locked";
      outputState = "suspended";
      unlockAttempt = undefined;
      diagnostics.clear();
      disposed = true;
    }
  };
  diagnostics.push("audio.created", {
    id,
    musicTracks: catalog.music.size,
    sfxEvents: catalog.sfx.size,
    dialogueLines: catalog.dialogue.size
  });
  return audio;

  function requireActive(): void {
    if (disposed) {
      throw createAudioError("audio.runtime_disposed", "Game Audio is disposed", { id });
    }
  }
}
