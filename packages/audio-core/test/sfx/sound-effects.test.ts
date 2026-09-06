import { describe, expect, it } from "vitest";
import { createGameAudio } from "../../src";
import { createMemoryAudioBackend } from "../../src/testing";
import { baseCatalog } from "../fixtures/audio-fixtures";

describe("SoundEffects", () => {
  it("selects variations per layer and returns controllable playback handles", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({ backend, ...baseCatalog(), random: () => 0 });

    const first = audio.sfx.play("sfx.weapon", { ownerId: "player" });
    const second = audio.sfx.play("sfx.weapon", { ownerId: "player" });
    if (first.status === "rejected" || first.status === "deduplicated") {
      throw new Error("Expected first SFX playback");
    }
    if (second.status === "rejected" || second.status === "deduplicated") {
      throw new Error("Expected second SFX playback");
    }

    expect(
      backend.instances().map((request) => request.instance.tracks.map((track) => track.id))
    ).toEqual([
      ["sfx.weapon:body:shot-a", "sfx.weapon:mechanical:mechanical"],
      ["sfx.weapon:body:shot-b", "sfx.weapon:mechanical:mechanical"]
    ]);
    expect(first.handle.pause()).toBe(true);
    expect(first.handle.resume()).toBe(true);
    expect(first.handle.seek(250)).toBe(true);
    expect(first.handle.set({ volume: 0.4, pitch: 1.2, pan: -0.5 }, 50)).toBe(true);
    expect(first.handle.getState()).toMatchObject({
      positionMs: 250,
      volume: 0.4,
      pitch: 1.2,
      pan: -0.5
    });
    expect(audio.sfx.stopOwner("player")).toBe(2);
  });

  it("enforces concurrency, bounded deduplication and spatial distance culling", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({
      backend,
      ...baseCatalog(),
      dedupeWindowMs: 100
    });

    expect(audio.sfx.play("sfx.weapon", { priority: 1 }).status).toBe("playing");
    expect(audio.sfx.play("sfx.weapon", { priority: 2 }).status).toBe("playing");
    const replacement = audio.sfx.play("sfx.weapon", { priority: 3 });
    expect(replacement).toMatchObject({
      status: "playing",
      stoppedInstanceIds: ["playback.0"]
    });

    const original = audio.sfx.play("sfx.weapon", { dedupeKey: "match:1:cue:4", priority: 4 });
    const duplicate = audio.sfx.play("sfx.weapon", { dedupeKey: "match:1:cue:4", priority: 4 });
    expect(original.status).toBe("playing");
    expect(duplicate.status).toBe("deduplicated");
    audio.update(101, 101);
    expect(audio.sfx.play("sfx.weapon", { dedupeKey: "match:1:cue:4", priority: 5 }).status).toBe(
      "playing"
    );

    audio.spatial.setEmitter({
      id: "far",
      transform: { position: { x: 11, y: 0 } }
    });
    expect(audio.sfx.play("sfx.spatial", { emitterId: "far" })).toEqual({
      status: "rejected",
      reason: "distance-culled"
    });
    expect(audio.sfx.snapshot()).toMatchObject({
      deduplicated: 1,
      distanceCulled: 1,
      stoppedForConcurrency: 3
    });
  });

  it("keeps concurrency membership synchronized with playback lifecycle stops", () => {
    const audio = createGameAudio({ backend: createMemoryAudioBackend(), ...baseCatalog() });
    const first = audio.sfx.play("sfx.weapon", { priority: 4 });
    const second = audio.sfx.play("sfx.weapon", { priority: 4 });
    if (
      first.status === "rejected" ||
      first.status === "deduplicated" ||
      second.status === "rejected" ||
      second.status === "deduplicated"
    ) {
      throw new Error("Expected initial SFX playback");
    }
    expect(first.handle.stop()).toBe(true);
    expect(audio.sfx.play("sfx.weapon", { priority: 0 })).toMatchObject({
      status: "playing",
      stoppedInstanceIds: []
    });
    expect(audio.sfx.snapshot().stoppedForConcurrency).toBe(0);
    audio.dispose();
  });

  it("advances delayed playback only for the elapsed time after its scheduled start", () => {
    const audio = createGameAudio({ backend: createMemoryAudioBackend(), ...baseCatalog() });
    const played = audio.sfx.play("sfx.weapon", { delayMs: 100, startOffsetMs: 250 });
    if (played.status === "rejected" || played.status === "deduplicated") {
      throw new Error("Expected scheduled SFX playback");
    }
    expect(played.status).toBe("scheduled");
    audio.update(50, 50);
    expect(played.handle.getState()).toMatchObject({ status: "scheduled", positionMs: 250 });
    audio.update(75, 125);
    expect(played.handle.getState()).toMatchObject({ status: "playing", positionMs: 275 });
  });

  it("forwards repeated backend markers for looping or middleware-authored playback", () => {
    const backend = createMemoryAudioBackend();
    const markers: string[] = [];
    const audio = createGameAudio({
      backend,
      ...baseCatalog(),
      onEvent(event) {
        if (event.type === "marker" && event.markerId !== undefined) {
          markers.push(event.markerId);
        }
      }
    });
    const played = audio.sfx.play("sfx.weapon");
    if (played.status === "rejected" || played.status === "deduplicated") {
      throw new Error("Expected SFX playback");
    }
    backend.marker(played.handle.id, "loop-beat", 100);
    backend.marker(played.handle.id, "loop-beat", 100);
    expect(markers).toEqual(["loop-beat", "loop-beat"]);
  });
});
