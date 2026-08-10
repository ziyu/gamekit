import type { AudioBackend } from "../backend/audio-backend";
import { createGameAudio } from "../composition/create-game-audio";

export type AudioBackendConformanceReport = {
  backendId: string;
  checks: string[];
  stoppedPlaybackInstances: number;
};

export async function runAudioBackendConformance(input: {
  createBackend: () => AudioBackend;
}): Promise<AudioBackendConformanceReport> {
  const backend = input.createBackend();
  const audio = createGameAudio({
    backend,
    sfx: [
      {
        id: "conformance.sfx",
        layers: [
          {
            id: "main",
            clips: [
              {
                id: "main",
                asset: { type: "audio", assetId: "audio.conformance" },
                loop: true
              }
            ]
          }
        ]
      }
    ],
    disposeBackend: false
  });
  const checks: string[] = [];
  if (await audio.unlock()) checks.push("unlock");
  audio.spatial.setListener({ id: "main", transform: { position: { x: 0, y: 0 } } });
  checks.push("listener");
  audio.spatial.setEmitter({ id: "emitter", transform: { position: { x: 1, y: 0 } } });
  checks.push("emitter");
  const played = audio.sfx.play("conformance.sfx", { emitterId: "emitter", ownerId: "owner" });
  if (played.status === "rejected" || played.status === "deduplicated") {
    throw new Error(`Audio backend conformance start failed: ${played.status}`);
  }
  checks.push("start");
  if (played.handle.pause()) checks.push("pause");
  if (played.handle.resume()) checks.push("resume");
  if (played.handle.seek(10)) checks.push("seek");
  if (played.handle.set({ volume: 0.5 })) checks.push("update");
  audio.mix.setBus("sfx", { volume: 0.8 });
  checks.push("bus");
  const stoppedPlaybackInstances = audio.sfx.stopOwner("owner");
  if (stoppedPlaybackInstances === 1) checks.push("stop");
  audio.dispose();
  backend.dispose();
  return { backendId: backend.id, checks, stoppedPlaybackInstances };
}
