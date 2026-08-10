import type { AudioBackend } from "../backend/audio-backend";
import type { AudioBackendCapabilities } from "../backend/backend-capabilities";
import type { AudioBackendEvent } from "../backend/backend-events";

const CAPABILITIES: AudioBackendCapabilities = {
  pause: true,
  seek: true,
  fades: true,
  scheduledStart: true,
  multipleTracks: true,
  spatial: false,
  multipleListeners: false,
  parameters: false,
  markers: false,
  streaming: false,
  authoredObjects: true
};

export function createNullAudioBackend(id = "audio.null"): AudioBackend {
  const active = new Map<string, number>();
  let eventListener: ((event: AudioBackendEvent) => void) | undefined;
  let unlocked = false;
  let suspended = false;
  let disposed = false;
  return {
    id,
    capabilities: { ...CAPABILITIES },
    start(request) {
      active.set(request.instance.id, Math.max(1, request.instance.tracks.length));
      return { accepted: true };
    },
    stop(instanceIds) {
      for (const instanceId of instanceIds) {
        if (active.delete(instanceId)) {
          eventListener?.({ type: "ended", instanceId, reason: "stopped" });
        }
      }
    },
    pause() {},
    resume() {},
    seek: (instanceId) => active.has(instanceId),
    updateInstances() {},
    setBuses() {},
    setListeners() {},
    setEmitters() {},
    setGlobalParameter() {},
    async unlock() {
      unlocked = true;
      return true;
    },
    suspend() {
      suspended = true;
    },
    resumeOutput() {
      suspended = false;
    },
    setEventListener(listener) {
      eventListener = listener;
    },
    snapshot() {
      return {
        id,
        activePlaybackInstances: active.size,
        nativePlaybackCount: [...active.values()].reduce((total, value) => total + value, 0),
        retainedCommands: 0,
        unlocked,
        suspended,
        disposed,
        capabilities: { ...CAPABILITIES }
      };
    },
    dispose() {
      active.clear();
      eventListener = undefined;
      disposed = true;
    }
  };
}
