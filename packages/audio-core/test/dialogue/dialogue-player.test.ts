import { describe, expect, it } from "vitest";
import { createGameAudio } from "../../src";
import { createMemoryAudioBackend } from "../../src/testing";
import { baseCatalog } from "../fixtures/audio-fixtures";

describe("DialoguePlayer", () => {
  it("queues dialogue by priority and advances after native completion", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({ backend, ...baseCatalog() });
    const dialogue = audio.dialogue;
    if (dialogue === undefined) {
      throw new Error("Expected dialogue controller");
    }

    const current = dialogue.play("dialogue.alpha");
    const low = dialogue.enqueue("dialogue.alpha", { priority: 1 });
    const high = dialogue.enqueue("dialogue.beta", { priority: 20 });
    expect(dialogue.getState()).toMatchObject({
      current: { id: current.id, lineId: "dialogue.alpha", status: "playing" },
      queue: [
        { id: high.id, lineId: "dialogue.beta" },
        { id: low.id, lineId: "dialogue.alpha" }
      ]
    });
    expect(audio.mix.snapshot().activations).toHaveLength(1);

    const instanceId = dialogue.getState().current?.playbackInstanceId;
    if (instanceId === undefined) {
      throw new Error("Expected active dialogue playback");
    }
    backend.complete(instanceId);
    expect(current.getState()?.status).toBe("completed");
    expect(dialogue.getState().current).toMatchObject({
      id: high.id,
      lineId: "dialogue.beta",
      status: "playing"
    });
  });

  it("supports explicit replacement, rejection and speaker cleanup policies", () => {
    const audio = createGameAudio({ backend: createMemoryAudioBackend(), ...baseCatalog() });
    const dialogue = audio.dialogue;
    if (dialogue === undefined) {
      throw new Error("Expected dialogue controller");
    }

    const first = dialogue.play("dialogue.alpha");
    const rejected = dialogue.play("dialogue.beta", { interrupt: "reject" });
    expect(rejected.getState()?.status).toBe("rejected");
    const replacement = dialogue.play("dialogue.beta", { interrupt: "replace-current" });
    expect(first.getState()?.status).toBe("stopped");
    expect(dialogue.getState().current?.id).toBe(replacement.id);
    expect(dialogue.stopSpeaker("speaker.beta")).toBe(1);
    expect(replacement.getState()?.status).toBe("stopped");
  });

  it("skips the current playback immediately and then advances the queue", () => {
    const backend = createMemoryAudioBackend();
    const audio = createGameAudio({ backend, ...baseCatalog() });
    const dialogue = audio.dialogue;
    if (dialogue === undefined) {
      throw new Error("Expected dialogue controller");
    }

    const current = dialogue.play("dialogue.alpha");
    const next = dialogue.enqueue("dialogue.beta");
    const currentPlaybackId = current.getState()?.playbackInstanceId;
    if (currentPlaybackId === undefined) {
      throw new Error("Expected active dialogue playback");
    }

    expect(dialogue.skipCurrent()).toBe(true);
    expect(current.getState()?.status).toBe("skipped");
    expect(dialogue.getState()).toMatchObject({
      current: { id: next.id, lineId: "dialogue.beta", status: "playing" },
      queue: []
    });
    expect(backend.commands()).toContainEqual({
      type: "stop",
      instanceIds: [currentPlaybackId],
      fadeMs: 0
    });
  });

  it("projects subtitle identity and deterministic authored markers", () => {
    const events: Array<{ type: string; markerId?: string | undefined }> = [];
    const audio = createGameAudio({
      backend: createMemoryAudioBackend(),
      ...baseCatalog(),
      onEvent: (event) => events.push(event)
    });
    const dialogue = audio.dialogue;
    if (dialogue === undefined) {
      throw new Error("Expected dialogue controller");
    }

    const line = dialogue.play("dialogue.alpha");
    expect(line.getState()).toMatchObject({
      subtitleKey: "dialogue.alpha.subtitle",
      status: "playing"
    });
    audio.update(60, 60);
    expect(events).toContainEqual(expect.objectContaining({ type: "marker", markerId: "gesture" }));
  });
});
