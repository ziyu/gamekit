import { createAudioError } from "../contracts/errors";
import type { AudioBusDefinition } from "./mix-types";

export type MutableAudioBus = {
  id: string;
  parentId?: string | undefined;
  volume: number;
  targetVolume: number;
  muted: boolean;
  paused: boolean;
  maxPlaybackInstances?: number | undefined;
};

type Ramp = { from: number; to: number; startedAt: number; endsAt: number };

export type AudioBusTree = {
  set(
    busId: string,
    patch: {
      volume?: number | undefined;
      muted?: boolean | undefined;
      paused?: boolean | undefined;
    },
    transitionMs: number,
    now: number
  ): void;
  update(now: number): boolean;
  get(busId: string): MutableAudioBus | undefined;
  values(): MutableAudioBus[];
  contains(ancestorId: string, candidateId: string): boolean;
};

export function createAudioBusTree(definitions: Map<string, AudioBusDefinition>): AudioBusTree {
  const buses = new Map<string, MutableAudioBus>();
  const ramps = new Map<string, Ramp>();
  for (const definition of definitions.values()) {
    buses.set(definition.id, {
      id: definition.id,
      ...(definition.parentId === undefined ? {} : { parentId: definition.parentId }),
      volume: definition.volume ?? 1,
      targetVolume: definition.volume ?? 1,
      muted: definition.muted ?? false,
      paused: definition.paused ?? false,
      ...(definition.maxPlaybackInstances === undefined
        ? {}
        : { maxPlaybackInstances: definition.maxPlaybackInstances })
    });
  }
  return {
    set(busId, patch, transitionMs, now) {
      const bus = buses.get(busId);
      if (bus === undefined) {
        throw createAudioError("audio.bus_missing", `Audio bus is missing: ${busId}`, { busId });
      }
      if (patch.volume !== undefined) {
        const volume = Math.min(1, Math.max(0, patch.volume));
        bus.targetVolume = volume;
        if (transitionMs > 0) {
          ramps.set(busId, {
            from: bus.volume,
            to: volume,
            startedAt: now,
            endsAt: now + transitionMs
          });
        } else {
          bus.volume = volume;
          ramps.delete(busId);
        }
      }
      if (patch.muted !== undefined) {
        bus.muted = patch.muted;
      }
      if (patch.paused !== undefined) {
        bus.paused = patch.paused;
      }
    },
    update(now) {
      let changed = false;
      for (const [busId, ramp] of ramps) {
        const bus = buses.get(busId);
        if (bus === undefined) {
          ramps.delete(busId);
          continue;
        }
        const progress =
          ramp.endsAt <= ramp.startedAt
            ? 1
            : Math.min(1, Math.max(0, (now - ramp.startedAt) / (ramp.endsAt - ramp.startedAt)));
        bus.volume = ramp.from + (ramp.to - ramp.from) * progress;
        changed = true;
        if (progress >= 1) {
          bus.volume = ramp.to;
          ramps.delete(busId);
        }
      }
      return changed;
    },
    get: (busId) => buses.get(busId),
    values: () => [...buses.values()].sort((a, b) => a.id.localeCompare(b.id)),
    contains(ancestorId, candidateId) {
      let current = buses.get(candidateId);
      while (current !== undefined) {
        if (current.id === ancestorId) {
          return true;
        }
        current = current.parentId === undefined ? undefined : buses.get(current.parentId);
      }
      return false;
    }
  };
}
