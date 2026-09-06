import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import {
  createPhaserAudioRuntime,
  loadPhaserAsset,
  releasePhaserAsset
} from "../src/driver/runtime";
import { createPhaserDriverAssetLoader, type PhaserDriverAssetRuntime } from "../src";

it("removes playback records and tweens for unloaded audio without stopping other instances", () => {
  const sounds = new Map<
    string,
    { stop: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
  >();
  const killTweensOf = vi.fn();
  const runtime = createPhaserAudioRuntime({
    cache: { audio: { exists: () => true } },
    sound: {
      locked: false,
      add(id: string) {
        const sound = { stop: vi.fn(), destroy: vi.fn() };
        sounds.set(id, sound);
        return sound;
      }
    },
    tweens: { killTweensOf }
  });
  const ended = vi.fn();
  for (const id of ["released", "retained"]) {
    expect(
      runtime.start({
        instanceId: id,
        tracks: [
          {
            id: "main",
            asset: { assetId: id, type: "audio" },
            volume: 1,
            pitch: 1,
            loop: true,
            startOffsetMs: 0
          }
        ],
        volume: 1,
        rate: 1,
        pan: 0,
        delayMs: 0,
        fadeInMs: 0,
        onEnded: (reason) => ended(id, reason)
      })
    ).toBe(true);
  }
  runtime.releaseAsset("released");
  expect(runtime.snapshot()).toMatchObject({ activePlaybackInstances: 1, nativePlaybackCount: 1 });
  expect(ended).toHaveBeenCalledExactlyOnceWith("released", "stopped");
  expect(sounds.get("released")!.destroy).toHaveBeenCalledOnce();
  expect(killTweensOf).toHaveBeenCalledWith(sounds.get("released"));
  expect(sounds.get("retained")!.destroy).not.toHaveBeenCalled();
  runtime.releaseAsset("released");
  expect(ended).toHaveBeenCalledTimes(1);
  runtime.destroy();
});

it("waits for a failed multi-file load to drain before allowing resource cleanup", async () => {
  const loader = Object.assign(new EventEmitter(), { start() {} });
  const scene = { load: loader, events: new EventEmitter() };
  let settled = false;
  const loading = loadPhaserAsset(
    scene,
    "atlas",
    () => false,
    () => {}
  );
  const outcome = loading.catch(() => {
    settled = true;
  });
  loader.emit("loaderror", { key: "atlas" });
  await Promise.resolve();
  expect(settled).toBe(false);
  loader.emit("complete");
  await outcome;
  expect(settled).toBe(true);
  expect(loader.listenerCount("loaderror")).toBe(0);
  expect(scene.events.listenerCount("shutdown")).toBe(0);
});

it("releases owned animations, textures and audio without touching unrelated resources", () => {
  const animations = new Set(["hero.walk", "other.walk"]),
    textures = new Set(["hero", "other"]);
  const sound = { destroy: vi.fn() },
    audio = new Set(["music", "other"]);
  const scene = {
    textures: {
      exists: (id: string) => textures.has(id),
      remove: (id: string) => textures.delete(id)
    },
    anims: { remove: (id: string) => animations.delete(id) },
    sound: { getAll: (id: string) => (id === "music" ? [sound] : []) },
    cache: { audio: { remove: (id: string) => audio.delete(id) } }
  };
  const owned = new Map([["hero", new Set(["hero.walk"])]]);
  releasePhaserAsset(scene, owned, "hero", "atlas");
  releasePhaserAsset(scene, owned, "hero", "atlas");
  releasePhaserAsset(scene, owned, "music", "audio");
  expect([...textures]).toEqual(["other"]);
  expect([...animations]).toEqual(["other.walk"]);
  expect([...audio]).toEqual(["other"]);
  expect(sound.destroy).toHaveBeenCalledOnce();
});

it("reclaims a cancelled Phaser load after native completion", async () => {
  let resolve!: () => void;
  const unload = vi.fn();
  const runtime: PhaserDriverAssetRuntime = {
    hasTexture: () => false,
    hasAudio: () => false,
    loadImage: () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
    loadSpritesheet: async () => {},
    loadAtlas: async () => {},
    loadAudio: async () => {},
    createAnimations() {},
    unloadAsset: unload
  };
  const adapter = createPhaserDriverAssetLoader({ id: "test", runtime: () => runtime });
  const controller = new AbortController();
  const loading = adapter.load(
    { id: "hero", type: "image", source: { type: "url", url: "hero.png" } },
    { signal: controller.signal }
  );
  controller.abort();
  resolve();
  await expect(loading).rejects.toMatchObject({ name: "AbortError" });
  expect(unload).toHaveBeenCalledWith("hero", "image");
});
