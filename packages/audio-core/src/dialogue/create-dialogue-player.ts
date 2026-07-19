import type { CompiledAudioCatalog } from "../catalog/audio-catalog";
import { resolveAudioSource } from "../catalog/resolve-audio-source";
import { createAudioError } from "../contracts/errors";
import type { DialogueHandleId } from "../contracts/identifiers";
import type { PlaybackHandle } from "../contracts/playback";
import type { AudioMixerController } from "../mix/audio-mixer";
import type { AudioDiagnosticSink } from "../observability/audio-diagnostics";
import type { PlaybackCoordinator } from "../playback/playback-coordinator";
import { createDialogueQueue, type DialogueQueueItem } from "./dialogue-queue";
import type { DialogueHandle, DialoguePlayOptions, DialoguePlayer } from "./dialogue-player";
import type { DialogueItemState, DialogueItemStatus, DialogueState } from "./dialogue-state";

type ActiveDialogue = DialogueQueueItem & {
  playback: PlaybackHandle;
  duckingActivationId?: string | undefined;
};

export type DialoguePlayerController = DialoguePlayer & {
  dispose(): void;
};

export function createDialoguePlayer(options: {
  catalog: CompiledAudioCatalog;
  playback: PlaybackCoordinator;
  mixer: AudioMixerController;
  diagnostics: AudioDiagnosticSink;
  clock(): number;
  random: () => number;
  retainedStateLimit?: number | undefined;
}): DialoguePlayerController {
  const queue = createDialogueQueue();
  const states = new Map<DialogueHandleId, DialogueItemState>();
  const retainedStateLimit = Math.max(0, options.retainedStateLimit ?? 256);
  const terminalOverrides = new Map<string, DialogueItemStatus>();
  let active: ActiveDialogue | undefined;
  let nextHandleId = 0;
  let disposed = false;

  const unsubscribe = options.playback.subscribe((event) => {
    if (
      active?.playback.id !== event.instanceId ||
      (event.type !== "completed" && event.type !== "stopped" && event.type !== "failed")
    ) {
      return;
    }
    const item = active;
    const overridden = terminalOverrides.get(event.instanceId);
    terminalOverrides.delete(event.instanceId);
    item.state.status =
      overridden ??
      (event.type === "completed" ? "completed" : event.type === "failed" ? "rejected" : "stopped");
    states.set(item.state.id, cloneItemState(item.state));
    if (item.duckingActivationId !== undefined) {
      options.mixer.deactivateSnapshot(item.duckingActivationId, 80);
    }
    active = undefined;
    trimStates();
    startNext();
  });

  const player: DialoguePlayerController = {
    play(lineId, input = {}) {
      requireActive();
      const item = createItem(lineId, input);
      if (active === undefined) {
        start(item);
        return createHandle(item.state.id);
      }
      const policy = input.interrupt ?? item.definition.interrupt ?? "queue";
      switch (policy) {
        case "queue":
          enqueueItem(item);
          break;
        case "reject":
          item.state.status = "rejected";
          states.set(item.state.id, cloneItemState(item.state));
          options.diagnostics.push("audio.dialogue.rejected", {
            lineId,
            reason: "active-dialogue"
          });
          break;
        case "replace-current": {
          const previous = active;
          previous.state.status = "stopped";
          states.set(previous.state.id, cloneItemState(previous.state));
          active = undefined;
          if (previous.duckingActivationId !== undefined) {
            options.mixer.deactivateSnapshot(previous.duckingActivationId, 80);
          }
          previous.playback.stop({ fadeMs: 80 });
          start(item);
          break;
        }
      }
      return createHandle(item.state.id);
    },
    enqueue(lineId, input = {}) {
      requireActive();
      const item = createItem(lineId, input);
      if (active === undefined) {
        start(item);
      } else {
        enqueueItem(item);
      }
      return createHandle(item.state.id);
    },
    skipCurrent(fadeOptions) {
      requireActive();
      if (active === undefined) {
        return false;
      }
      terminalOverrides.set(active.playback.id, "skipped");
      return active.playback.stop(fadeOptions);
    },
    stopSpeaker(speakerId, fadeOptions) {
      requireActive();
      let affected = 0;
      for (const item of queue.removeSpeaker(speakerId)) {
        item.state.status = "stopped";
        states.set(item.state.id, cloneItemState(item.state));
        affected += 1;
      }
      if (active?.state.speakerId === speakerId) {
        terminalOverrides.set(active.playback.id, "stopped");
        active.playback.stop(fadeOptions);
        affected += 1;
      }
      trimStates();
      return affected;
    },
    getState(): DialogueState {
      return {
        ...(active === undefined ? {} : { current: cloneItemState(active.state) }),
        queue: queue.values().map((item) => cloneItemState(item.state))
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      unsubscribe();
      for (const item of queue.clear()) {
        item.state.status = "stopped";
      }
      if (active !== undefined) {
        active.playback.stop();
        if (active.duckingActivationId !== undefined) {
          options.mixer.deactivateSnapshot(active.duckingActivationId, 0);
        }
      }
      active = undefined;
      terminalOverrides.clear();
      states.clear();
      disposed = true;
    }
  };
  return player;

  function createItem(lineId: string, input: DialoguePlayOptions): DialogueQueueItem {
    const definition = options.catalog.dialogue.get(lineId);
    if (definition === undefined) {
      throw createAudioError(
        "audio.dialogue_missing",
        `Audio dialogue line is missing: ${lineId}`,
        {
          lineId
        }
      );
    }
    const id = `dialogue.${nextHandleId}`;
    nextHandleId += 1;
    const item: DialogueQueueItem = {
      definition,
      options: { ...input },
      state: {
        id,
        lineId,
        ...((input.speakerId ?? definition.speakerId) === undefined
          ? {}
          : { speakerId: input.speakerId ?? definition.speakerId }),
        ...(definition.subtitleKey === undefined ? {} : { subtitleKey: definition.subtitleKey }),
        status: "queued",
        priority: input.priority ?? definition.priority ?? 0,
        queuedAt: options.clock()
      }
    };
    states.set(id, cloneItemState(item.state));
    return item;
  }

  function enqueueItem(item: DialogueQueueItem): void {
    queue.add(item);
    states.set(item.state.id, cloneItemState(item.state));
    options.diagnostics.push("audio.dialogue.queued", {
      lineId: item.definition.id,
      handleId: item.state.id,
      priority: item.state.priority
    });
  }

  function start(item: DialogueQueueItem): void {
    const source = resolveAudioSource(item.definition.source, item.definition.id, options.random, {
      loop: false
    });
    const result = options.playback.start({
      category: "dialogue",
      sourceId: item.definition.id,
      tracks: source.tracks,
      ...(source.backendObject === undefined ? {} : { backendObject: source.backendObject }),
      busId: item.definition.bus ?? "dialogue",
      volume: item.options.volume,
      priority: item.state.priority,
      fadeInMs: item.options.fadeInMs,
      ...(item.options.ownerId === undefined ? {} : { ownerId: item.options.ownerId }),
      ...(item.options.emitterId === undefined ? {} : { emitterId: item.options.emitterId }),
      ...(item.options.transform === undefined ? {} : { transform: item.options.transform }),
      ...(item.definition.spatial === undefined ? {} : { spatial: item.definition.spatial }),
      tags: item.definition.tags,
      markers: item.definition.markers
    });
    if (result.status === "rejected") {
      item.state.status = "rejected";
      states.set(item.state.id, cloneItemState(item.state));
      options.diagnostics.push("audio.dialogue.rejected", {
        lineId: item.definition.id,
        reason: result.reason
      });
      startNext();
      return;
    }
    item.state.status = "playing";
    item.state.startedAt = options.clock();
    item.state.playbackInstanceId = result.handle.id;
    states.set(item.state.id, cloneItemState(item.state));
    const duckingActivationId =
      item.definition.duckingSnapshotId === undefined
        ? undefined
        : options.mixer.activateSnapshot(item.definition.duckingSnapshotId, {
            ownerId: item.state.id,
            fadeMs: 80
          });
    active = {
      ...item,
      playback: result.handle,
      ...(duckingActivationId === undefined ? {} : { duckingActivationId })
    };
    options.diagnostics.push("audio.dialogue.started", {
      lineId: item.definition.id,
      handleId: item.state.id,
      instanceId: result.handle.id,
      speakerId: item.state.speakerId
    });
  }

  function startNext(): void {
    if (active !== undefined || disposed) {
      return;
    }
    const next = queue.next();
    if (next !== undefined) {
      start(next);
    }
  }

  function createHandle(id: DialogueHandleId): DialogueHandle {
    return {
      id,
      getState() {
        const state = states.get(id);
        return state === undefined ? undefined : cloneItemState(state);
      },
      cancel(fadeOptions) {
        requireActive();
        const queued = queue.remove(id);
        if (queued !== undefined) {
          queued.state.status = "stopped";
          states.set(id, cloneItemState(queued.state));
          return true;
        }
        if (active?.state.id === id) {
          terminalOverrides.set(active.playback.id, "stopped");
          return active.playback.stop(fadeOptions);
        }
        return false;
      }
    };
  }

  function trimStates(): void {
    while (states.size > retainedStateLimit) {
      const oldest = states.keys().next().value;
      if (
        oldest === undefined ||
        active?.state.id === oldest ||
        queue.values().some((item) => item.state.id === oldest)
      ) {
        break;
      }
      states.delete(oldest);
    }
  }

  function requireActive(): void {
    if (disposed) {
      throw createAudioError("audio.runtime_disposed", "Audio dialogue player is disposed");
    }
  }
}

function cloneItemState(state: DialogueItemState): DialogueItemState {
  return { ...state };
}
