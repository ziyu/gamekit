import { describe, expect, it } from "vitest";
import { createGameAudio } from "../../src";
import { createMemoryAudioBackend } from "../../src/testing";
import { baseCatalog } from "../fixtures/audio-fixtures";

describe("GameAudio composition", () => {
  it("exposes separate domain facades and standard bus hierarchy", async () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({ backend, ...baseCatalog() });

    expect("play" in audio).toBe(false);
    expect(audio.music).toBeDefined();
    expect(audio.sfx).toBeDefined();
    expect(audio.dialogue).toBeDefined();
    expect(audio.mix.snapshot().buses.map((bus) => bus.id)).toEqual([
      "dialogue",
      "master",
      "music",
      "sfx",
      "sfx/ambience",
      "sfx/ui"
    ]);
    expect(await audio.unlock()).toBe(true);
    audio.suspend();
    expect(audio.snapshot()).toMatchObject({ output: "suspended", backend: { suspended: true } });
    audio.resume();
    expect(audio.snapshot()).toMatchObject({ output: "running", backend: { suspended: false } });
  });

  it("mixes snapshots, global parameters and spatial batch state", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({
      backend,
      ...baseCatalog(),
      parameters: [
        {
          id: "danger",
          scope: "global",
          kind: "continuous",
          min: 0,
          max: 1,
          defaultValue: 0
        }
      ]
    });

    audio.mix.setBus("master", { volume: 0.5 });
    const activationId = audio.mix.activateSnapshot("dialogue-duck");
    expect(audio.mix.getBus("music")?.effectiveVolume).toBeCloseTo(0.175);
    expect(audio.mix.deactivateSnapshot(activationId)).toBe(true);
    audio.mix.setGlobalParameter("danger", 2);
    expect(audio.mix.snapshot().globalParameters).toEqual({ danger: 1 });

    expect(
      audio.spatial.setEmitters([
        { id: "a", transform: { position: { x: 1, y: 2 } } },
        { id: "b", transform: { position: { x: 3, y: 4 } }, active: false }
      ])
    ).toBe(2);
    expect(audio.spatial.emitters()).toMatchObject([
      { id: "a", active: true },
      { id: "b", active: false }
    ]);
  });

  it("treats the origin listener as a fallback after an explicit listener is registered", () => {
    const backend = createMemoryAudioBackend();
    backend.capabilities.multipleListeners = false;
    const audio = createGameAudio({ backend, ...baseCatalog() });

    expect(audio.snapshot().spatial.listeners).toMatchObject([
      { id: "main", transform: { position: { x: 0, y: 0 } } }
    ]);

    audio.spatial.setListener({
      id: "player.listener",
      transform: { position: { x: 900, y: 500 } }
    });
    audio.spatial.setEmitter({
      id: "player.emitter",
      transform: { position: { x: 900, y: 500 } }
    });
    expect(audio.sfx.play("sfx.spatial", { emitterId: "player.emitter" }).status).toBe("playing");

    expect(audio.snapshot().spatial.listeners).toMatchObject([
      { id: "player.listener", transform: { position: { x: 900, y: 500 } } }
    ]);
    expect(backend.instances()[0]?.listeners).toMatchObject([
      { id: "player.listener", transform: { position: { x: 900, y: 500 } } }
    ]);

    expect(audio.spatial.removeListener("player.listener")).toBe(true);
    expect(audio.snapshot().spatial.listeners).toMatchObject([
      { id: "main", transform: { position: { x: 0, y: 0 } } }
    ]);
  });

  it("preserves borrowed backends and disposes owned backends", () => {
    const borrowed = createMemoryAudioBackend();
    const borrowedAudio = createGameAudio({
      backend: borrowed,
      ...baseCatalog(),
      disposeBackend: false
    });
    borrowedAudio.sfx.play("sfx.weapon");
    borrowedAudio.dispose();
    expect(borrowed.snapshot()).toMatchObject({ disposed: false, activePlaybackInstances: 0 });

    const owned = createMemoryAudioBackend();
    const ownedAudio = createGameAudio({ backend: owned, ...baseCatalog() });
    ownedAudio.dispose();
    expect(owned.snapshot()).toMatchObject({ disposed: true, activePlaybackInstances: 0 });
  });

  it("reports explicit capability degradation instead of pretending unsupported behavior", () => {
    const backend = createMemoryAudioBackend();
    backend.capabilities.multipleTracks = false;
    backend.capabilities.scheduledStart = false;
    backend.capabilities.spatial = false;
    const audio = createGameAudio({ backend, ...baseCatalog() });

    expect(audio.sfx.play("sfx.weapon")).toEqual({
      status: "rejected",
      reason: "backend-rejected"
    });
    const spatial = audio.sfx.play("sfx.spatial", {
      transform: { position: { x: 1, y: 0 } },
      delayMs: 100
    });
    expect(spatial.status).toBe("playing");
    expect(audio.diagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "audio.playback.capability_degraded",
          payload: expect.objectContaining({ capability: "multipleTracks", result: "rejected" })
        }),
        expect.objectContaining({
          type: "audio.playback.capability_degraded",
          payload: expect.objectContaining({
            capability: "scheduledStart",
            result: "started-immediately"
          })
        }),
        expect.objectContaining({
          type: "audio.playback.capability_degraded",
          payload: expect.objectContaining({ capability: "spatial", result: "non-spatial-output" })
        })
      ])
    );
  });

  it("keeps music capacity isolated from SFX stealing", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({
      backend,
      ...baseCatalog(),
      maxPlaybackInstances: 3,
      playbackBudgets: {
        music: { maxPlaybackInstances: 2, maxNativePlaybackCount: 4 },
        sfx: { maxPlaybackInstances: 1, maxNativePlaybackCount: 2 }
      }
    });

    audio.music.play("music.explore");
    expect(audio.sfx.play("sfx.spatial", { priority: 1 }).status).toBe("playing");
    expect(audio.sfx.play("sfx.spatial", { priority: 2 })).toMatchObject({
      status: "playing",
      stoppedInstanceIds: ["playback.1"]
    });
    expect(audio.music.getState()).toMatchObject({
      status: "playing",
      trackId: "music.explore",
      instanceId: "playback.0"
    });
    expect(audio.snapshot().playback.map((instance) => instance.category)).toEqual([
      "music",
      "sfx"
    ]);
  });
});
