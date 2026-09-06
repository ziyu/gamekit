import { describe, expect, it } from "vitest";
import { createGameAudio } from "../../src";
import { createMemoryAudioBackend } from "../../src/testing";
import { baseCatalog } from "../fixtures/audio-fixtures";

describe("MusicPlayer", () => {
  it("owns music state, adaptive stems and transitions", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({ backend, ...baseCatalog() });

    expect(audio.music.play("music.explore")).toMatchObject({
      status: "playing",
      trackId: "music.explore",
      instanceId: "playback.0"
    });
    expect(backend.instances()[0]?.instance.tracks.map((track) => track.volume)).toEqual([1, 0]);

    audio.music.setIntensity(0.5, 120);
    expect(audio.music.getState().intensity).toBe(0.5);
    expect(backend.instances()[0]?.instance.tracks.map((track) => track.volume)).toEqual([1, 0.5]);

    const transitioned = audio.music.transitionTo("music.combat");
    expect(transitioned).toMatchObject({
      status: "playing",
      trackId: "music.combat",
      transition: {
        fromTrackId: "music.explore",
        toTrackId: "music.combat",
        transition: { type: "crossfade", durationMs: 400 }
      }
    });
    audio.update(400, 400);
    expect(audio.music.getState()).not.toHaveProperty("transition");
  });

  it("keeps pause, seek and stop on the music control surface", () => {
    const audio = createGameAudio({ backend: createMemoryAudioBackend(), ...baseCatalog() });
    audio.music.play("music.explore");
    audio.music.pause();
    expect(audio.music.getState().status).toBe("paused");
    audio.music.seek(1_500);
    expect(audio.music.getState().positionMs).toBe(1_500);
    audio.music.resume();
    expect(audio.music.getState().status).toBe("playing");
    audio.music.stop({ fadeMs: 50 });
    expect(audio.music.getState()).toMatchObject({ status: "stopped", positionMs: 0 });
  });
});
