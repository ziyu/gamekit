import type { CompiledAudioCatalog } from "../catalog/audio-catalog";
import { resolveAudioSource } from "../catalog/resolve-audio-source";
import type { ResolvedAudioTrack } from "../catalog/source-definition";
import { unitInterval } from "../catalog/validation";
import { createAudioError } from "../contracts/errors";
import type { PlaybackHandle } from "../contracts/playback";
import type { AudioDiagnosticSink } from "../observability/audio-diagnostics";
import type { PlaybackCoordinator } from "../playback/playback-coordinator";
import type { MusicTrackDefinition } from "./music-definition";
import type { MusicPlayer, MusicPlayOptions } from "./music-player";
import type { MusicState } from "./music-state";
import { resolveMusicTransition } from "./transition-controller";

type ActiveMusic = {
  definition: MusicTrackDefinition;
  handle: PlaybackHandle;
  baseTracks: ResolvedAudioTrack[];
};

export type MusicPlayerController = MusicPlayer & {
  update(now: number): void;
  dispose(): void;
};

export function createMusicPlayer(options: {
  catalog: CompiledAudioCatalog;
  playback: PlaybackCoordinator;
  diagnostics: AudioDiagnosticSink;
  clock(): number;
  random: () => number;
}): MusicPlayerController {
  let active: ActiveMusic | undefined;
  let state: MusicState = { status: "stopped", positionMs: 0, intensity: 0 };
  const unsubscribe = options.playback.subscribe((event) => {
    if (
      active?.handle.id === event.instanceId &&
      (event.type === "completed" || event.type === "stopped" || event.type === "failed")
    ) {
      active = undefined;
      state = { status: "stopped", positionMs: 0, intensity: state.intensity };
    }
  });

  const player: MusicPlayerController = {
    play(trackId, input = {}) {
      active?.handle.stop();
      return startTrack(trackId, input);
    },
    transitionTo(trackId, requested) {
      const definition = requireTrack(trackId);
      const transition = requested ?? definition.defaultTransition ?? { type: "cut" };
      const resolved = resolveMusicTransition(transition);
      const previous = active;
      const previousTrackId = previous?.definition.id;
      const nextState = startTrack(
        trackId,
        {
          fadeInMs: resolved.fadeInMs,
          startOffsetMs: 0
        },
        resolved.delayMs
      );
      previous?.handle.stop({ fadeMs: resolved.fadeOutMs });
      if (resolved.durationMs > 0) {
        state = {
          ...nextState,
          transition: {
            ...(previousTrackId === undefined ? {} : { fromTrackId: previousTrackId }),
            toTrackId: trackId,
            transition,
            startedAt: options.clock(),
            endsAt: options.clock() + resolved.durationMs
          }
        };
      }
      options.diagnostics.push("audio.music.transitioned", {
        fromTrackId: previousTrackId,
        toTrackId: trackId,
        transition: transition.type
      });
      return cloneState(state);
    },
    setIntensity(value, transitionMs = 0) {
      const intensity = unitInterval(value, 0, "music intensity");
      state = { ...state, intensity };
      if (active !== undefined && active.definition.source.kind === "asset") {
        options.playback.replaceTracks(
          active.handle.id,
          applyIntensity(active.baseTracks, active.definition, intensity),
          transitionMs
        );
      } else if (active !== undefined) {
        options.diagnostics.push("audio.music.capability_degraded", {
          trackId: active.definition.id,
          capability: "authored intensity parameter"
        });
      }
    },
    pause() {
      if (active?.handle.pause()) {
        state = { ...state, status: "paused" };
      }
    },
    resume() {
      if (active?.handle.resume()) {
        const playback = active.handle.getState();
        state = {
          ...state,
          status: playback?.status === "scheduled" ? "scheduled" : "playing"
        };
      }
    },
    seek(positionMs) {
      if (active?.handle.seek(positionMs)) {
        state = { ...state, positionMs: Math.max(0, positionMs) };
      }
    },
    stop(fadeOptions) {
      active?.handle.stop(fadeOptions);
      active = undefined;
      state = { status: "stopped", positionMs: 0, intensity: state.intensity };
    },
    getState: () => cloneState(state),
    update(now) {
      if (state.transition !== undefined && now >= state.transition.endsAt) {
        const { transition: _transition, ...rest } = state;
        state = rest;
      }
      const playback = active?.handle.getState();
      if (playback !== undefined) {
        state = {
          ...state,
          status:
            playback.status === "paused"
              ? "paused"
              : playback.status === "scheduled"
                ? "scheduled"
                : "playing",
          positionMs: playback.positionMs
        };
      }
    },
    dispose() {
      unsubscribe();
      active?.handle.stop();
      active = undefined;
      state = { status: "stopped", positionMs: 0, intensity: state.intensity };
    }
  };
  return player;

  function startTrack(trackId: string, input: MusicPlayOptions, delayMs = 0): MusicState {
    const definition = requireTrack(trackId);
    const source = resolveAudioSource(definition.source, `${trackId}:main`, options.random, {
      loop: definition.loop
    });
    const baseTracks = [...source.tracks];
    for (const stem of definition.stems ?? []) {
      const resolved = resolveAudioSource(
        stem.source,
        `${trackId}:stem:${stem.id}`,
        options.random,
        {
          volume: stem.volume,
          loop: definition.loop
        }
      );
      baseTracks.push(...resolved.tracks);
    }
    const result = options.playback.start({
      category: "music",
      sourceId: trackId,
      tracks: applyIntensity(baseTracks, definition, state.intensity),
      ...(source.backendObject === undefined ? {} : { backendObject: source.backendObject }),
      busId: definition.bus ?? "music",
      volume: (definition.volume ?? 1) * (input.volume ?? 1),
      pitch: definition.pitch,
      loop: definition.loop,
      delayMs,
      startOffsetMs: input.startOffsetMs,
      fadeInMs: input.fadeInMs,
      markers: definition.markers,
      tags: definition.tags
    });
    if (result.status === "rejected") {
      throw createAudioError(
        "audio.backend_rejected",
        `Audio music playback was rejected: ${trackId}`,
        { trackId, reason: result.reason }
      );
    }
    active = { definition, handle: result.handle, baseTracks };
    state = {
      status: result.status,
      trackId,
      instanceId: result.handle.id,
      positionMs: input.startOffsetMs ?? 0,
      intensity: state.intensity
    };
    options.diagnostics.push("audio.music.started", {
      trackId,
      instanceId: result.handle.id,
      delayMs,
      fadeInMs: input.fadeInMs ?? 0
    });
    return cloneState(state);
  }

  function requireTrack(trackId: string): MusicTrackDefinition {
    const definition = options.catalog.music.get(trackId);
    if (definition === undefined) {
      throw createAudioError("audio.music_missing", `Audio music track is missing: ${trackId}`, {
        trackId
      });
    }
    return definition;
  }
}

function applyIntensity(
  tracks: ResolvedAudioTrack[],
  definition: MusicTrackDefinition,
  intensity: number
): ResolvedAudioTrack[] {
  const stems = new Map((definition.stems ?? []).map((stem) => [stem.id, stem]));
  return tracks.map((track) => {
    const marker = ":stem:";
    const markerIndex = track.id.indexOf(marker);
    if (markerIndex < 0) {
      return { ...track, asset: { ...track.asset } };
    }
    const remainder = track.id.slice(markerIndex + marker.length);
    const stemId = remainder.slice(0, remainder.indexOf(":"));
    const stem = stems.get(stemId);
    const range = stem?.intensity;
    const weight =
      range === undefined
        ? 1
        : range.max <= range.min
          ? intensity >= range.max
            ? 1
            : 0
          : Math.min(1, Math.max(0, (intensity - range.min) / (range.max - range.min)));
    return { ...track, asset: { ...track.asset }, volume: track.volume * weight };
  });
}

function cloneState(state: MusicState): MusicState {
  return {
    ...state,
    ...(state.transition === undefined
      ? {}
      : { transition: { ...state.transition, transition: { ...state.transition.transition } } })
  };
}
