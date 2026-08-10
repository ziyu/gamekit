import type { CompiledAudioCatalog } from "../catalog/audio-catalog";
import { nonNegativeInteger } from "../catalog/validation";
import { createAudioError } from "../contracts/errors";
import type { PlaybackCoordinator } from "../playback/playback-coordinator";
import type { AudioDiagnosticSink } from "../observability/audio-diagnostics";
import type { SpatialAudioController } from "../spatial/spatial-audio";
import type { SoundEffects, SoundEffectsSnapshot } from "./sound-effects";
import { decideSfxConcurrency, rememberSfxConcurrency } from "./concurrency-policy";
import { selectSfxTracks, type SfxVariationState } from "./variation-selector";

type DedupeEntry = { timestamp: number; instanceId?: string | undefined };

export type SoundEffectsController = SoundEffects & {
  update(now: number): void;
  dispose(): void;
};

export function createSoundEffects(options: {
  catalog: CompiledAudioCatalog;
  playback: PlaybackCoordinator;
  spatial: SpatialAudioController;
  diagnostics: AudioDiagnosticSink;
  clock(): number;
  random: () => number;
  maxDedupeEntries?: number | undefined;
  dedupeWindowMs?: number | undefined;
}): SoundEffectsController {
  const maxDedupeEntries = nonNegativeInteger(
    options.maxDedupeEntries,
    1_024,
    "SFX maxDedupeEntries"
  );
  const dedupeWindowMs = Math.max(0, options.dedupeWindowMs ?? 30_000);
  const dedupe = new Map<string, DedupeEntry>();
  const retriggered = new Map<string, number>();
  const selection: SfxVariationState = { sequence: new Map(), previous: new Map() };
  let rejected = 0;
  let deduplicated = 0;
  let distanceCulled = 0;
  let stoppedForConcurrency = 0;

  return {
    play(eventId, input = {}) {
      const event = options.catalog.sfx.get(eventId);
      if (event === undefined) {
        throw createAudioError("audio.sfx_missing", `Audio SFX event is missing: ${eventId}`, {
          eventId
        });
      }
      const now = options.clock();
      if (input.dedupeKey !== undefined) {
        const previous = dedupe.get(input.dedupeKey);
        if (previous !== undefined && now - previous.timestamp <= dedupeWindowMs) {
          deduplicated += 1;
          const handle =
            previous.instanceId === undefined
              ? undefined
              : options.playback.handle(previous.instanceId);
          options.diagnostics.push("audio.sfx.deduplicated", {
            eventId,
            dedupeKey: input.dedupeKey,
            ...(previous.instanceId === undefined ? {} : { instanceId: previous.instanceId })
          });
          return { status: "deduplicated", ...(handle === undefined ? {} : { handle }) };
        }
      }
      const transform = resolveTransform(input.emitterId, input.transform);
      if (
        event.spatial !== undefined &&
        transform !== undefined &&
        options.spatial.isDistanceCulled(event.spatial, transform)
      ) {
        distanceCulled += 1;
        retainDedupe(input.dedupeKey, undefined, now);
        options.diagnostics.push("audio.sfx.distance_culled", {
          eventId,
          emitterId: input.emitterId,
          dedupeKey: input.dedupeKey
        });
        return { status: "rejected", reason: "distance-culled" };
      }
      const tracks = selectSfxTracks(event, options.random, selection);
      if (tracks.length === 0 && event.backendObject === undefined) {
        rejected += 1;
        return { status: "rejected", reason: "no-playable-layer" };
      }
      const priority = input.priority ?? event.priority ?? 0;
      const decision = decideSfxConcurrency({
        event,
        definitions: options.catalog.concurrency,
        active: options.playback.list({ category: "sfx" }),
        ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
        ...(input.emitterId === undefined ? {} : { emitterId: input.emitterId }),
        priority,
        now,
        retriggered
      });
      if (!decision.accepted) {
        rejected += 1;
        options.diagnostics.push("audio.sfx.rejected", {
          eventId,
          reason: "concurrency",
          dedupeKey: input.dedupeKey
        });
        return { status: "rejected", reason: "concurrency" };
      }
      const result = options.playback.start({
        ...(input.instanceId === undefined ? {} : { instanceId: input.instanceId }),
        category: "sfx",
        sourceId: eventId,
        tracks,
        ...(event.backendObject === undefined ? {} : { backendObject: event.backendObject }),
        busId: input.bus ?? event.bus ?? "sfx",
        volume: input.volume,
        pitch: input.pitch,
        pan: input.pan,
        loop: input.loop ?? event.loop,
        priority,
        delayMs: input.delayMs,
        startOffsetMs: input.startOffsetMs,
        fadeInMs: input.fadeInMs,
        ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
        ...(input.emitterId === undefined ? {} : { emitterId: input.emitterId }),
        ...(input.transform === undefined ? {} : { transform: input.transform }),
        ...(event.spatial === undefined ? {} : { spatial: event.spatial }),
        parameters: { ...event.parameters, ...input.parameters },
        tags: [
          ...(event.tags ?? []),
          ...(event.concurrency ?? []).map((id) => `concurrency:${id}`)
        ],
        replaceInstanceIds: decision.replaceInstanceIds
      });
      if (result.status === "rejected") {
        rejected += 1;
        return {
          status: "rejected",
          reason:
            result.reason === "duplicate-instance-id" ? "duplicate-instance-id" : "backend-rejected"
        };
      }
      stoppedForConcurrency += decision.replaceInstanceIds.length;
      rememberSfxConcurrency({
        event,
        definitions: options.catalog.concurrency,
        ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
        ...(input.emitterId === undefined ? {} : { emitterId: input.emitterId }),
        now,
        retriggered
      });
      retainDedupe(input.dedupeKey, result.handle.id, now);
      options.diagnostics.push("audio.sfx.started", {
        eventId,
        instanceId: result.handle.id,
        dedupeKey: input.dedupeKey,
        emitterId: input.emitterId
      });
      return result;
    },
    stop(handle, fadeOptions) {
      return (
        options.playback.stop({ instanceId: handle.id, category: "sfx" }, fadeOptions?.fadeMs) > 0
      );
    },
    stopOwner(ownerId, fadeOptions) {
      return options.playback.stop({ category: "sfx", ownerId }, fadeOptions?.fadeMs);
    },
    stopEmitter(emitterId, fadeOptions) {
      return options.playback.stop({ category: "sfx", emitterId }, fadeOptions?.fadeMs);
    },
    snapshot(): SoundEffectsSnapshot {
      return {
        active: options.playback.list({ category: "sfx" }).length,
        rejected,
        deduplicated,
        distanceCulled,
        stoppedForConcurrency
      };
    },
    update(now) {
      for (const [key, entry] of dedupe) {
        if (now - entry.timestamp > dedupeWindowMs) {
          dedupe.delete(key);
        }
      }
      const longestWindow = Math.max(
        0,
        ...[...options.catalog.concurrency.values()].map((entry) => entry.retriggerMs ?? 0)
      );
      for (const [key, timestamp] of retriggered) {
        if (now - timestamp > longestWindow) {
          retriggered.delete(key);
        }
      }
      trim(dedupe, maxDedupeEntries);
      trim(retriggered, maxDedupeEntries);
    },
    dispose() {
      dedupe.clear();
      retriggered.clear();
      selection.sequence.clear();
      selection.previous.clear();
    }
  };

  function resolveTransform(
    emitterId: string | undefined,
    inline: import("../spatial/spatial-types").AudioTransform | undefined
  ) {
    if (inline !== undefined) {
      return inline;
    }
    if (emitterId === undefined) {
      return undefined;
    }
    const emitter = options.spatial.emitter(emitterId);
    if (emitter === undefined) {
      throw createAudioError("audio.emitter_missing", `Audio emitter is missing: ${emitterId}`);
    }
    return emitter.transform;
  }

  function retainDedupe(
    key: string | undefined,
    instanceId: string | undefined,
    timestamp: number
  ): void {
    if (key === undefined || maxDedupeEntries === 0) {
      return;
    }
    dedupe.delete(key);
    dedupe.set(key, { timestamp, ...(instanceId === undefined ? {} : { instanceId }) });
    trim(dedupe, maxDedupeEntries);
  }
}

function trim<T>(values: Map<string, T>, limit: number): void {
  while (values.size > limit) {
    const oldest = values.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    values.delete(oldest);
  }
}
