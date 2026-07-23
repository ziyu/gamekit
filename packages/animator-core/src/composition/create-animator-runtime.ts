import { triggerAnimatorOneShot, type AnimatorOneShotRecord } from "../action/one-shot-controller";
import { createAnimatorError } from "../contracts/errors";
import type { AnimatorRuntime } from "../controller/animator-controller";
import type { AnimatorControllerState } from "../state/controller-state";
import { setAnimatorParameter } from "../state/parameter-store";
import { resetAnimatorControllerState } from "../state/reset-controller";
import { updateAnimatorController } from "../controller/update-controller";
import { cloneAnimatorBindingDefinition } from "../graph/clone-definitions";
import { compileAnimatorController } from "../state/compile-controller";
import type { AnimatorMarkerEvent } from "../marker/marker-event";
import { cloneAnimatorMarker } from "../marker/marker-event";
import { projectAnimatorControllerSnapshot } from "../observability/snapshot-projector";
import { createAnimatorTraceStore } from "../observability/trace-store";
import {
  cancelAnimatorGameplayPhase,
  syncAnimatorGameplayPhase,
  type AnimatorGameplayPhaseSyncResult
} from "../phase/gameplay-phase-controller";
import type { AnimationPlaybackFrame } from "../playback/playback-frame";
import type { CreateAnimatorRuntimeOptions } from "./options";
import { resolveAnimatorRuntimeLimits } from "./runtime-config";

export function createAnimatorRuntime(options: CreateAnimatorRuntimeOptions): AnimatorRuntime {
  const id = options.id ?? "animator";
  const limits = resolveAnimatorRuntimeLimits(options);
  const controllers = new Map<string, AnimatorControllerState>();
  let elapsed = 0;
  let disposed = false;
  let appliedFrames = 0;
  let emittedMarkers = 0;
  const traceStore = createAnimatorTraceStore({
    limit: limits.traceLimit,
    clock: () => elapsed,
    ...(options.onTrace === undefined ? {} : { onTrace: options.onTrace }),
    ...(options.onTraceError === undefined ? {} : { onTraceError: options.onTraceError })
  });
  traceStore.push("lifecycle", "animator.created");

  const runtime: AnimatorRuntime = {
    bind(binding) {
      requireActive();
      if (!binding.controllerId || controllers.has(binding.controllerId)) {
        throw createAnimatorError(
          "animator.controller_bound",
          `Animator controller is already bound: ${binding.controllerId}`,
          { controllerId: binding.controllerId }
        );
      }
      if (controllers.size >= limits.maxControllers) {
        throw createAnimatorError("animator.limit_exceeded", "Animator controller limit exceeded", {
          maxControllers: limits.maxControllers
        });
      }
      const state = compileAnimatorController(options.dataRegistry, binding, elapsed);
      options.adapter.bind(
        binding.controllerId,
        cloneAnimatorBindingDefinition(state.definition),
        binding.renderObjectId
      );
      controllers.set(binding.controllerId, state);
      traceStore.push("lifecycle", "animator.controller_bound", binding.controllerId, {
        bindingId: binding.bindingId,
        renderObjectId: binding.renderObjectId,
        generation: state.generation
      });
    },
    unbind(controllerId) {
      if (!controllers.has(controllerId)) {
        return;
      }
      options.adapter.unbind(controllerId);
      controllers.delete(controllerId);
      traceStore.push("lifecycle", "animator.controller_unbound", controllerId);
    },
    hasController(controllerId) {
      return controllers.has(controllerId);
    },
    setParameter(controllerId, parameterId, value) {
      const state = requireController(controllerId);
      if (setAnimatorParameter(state, parameterId, value)) {
        traceStore.push("parameter", "animator.parameter_changed", controllerId, {
          parameterId,
          value
        });
      }
    },
    setParameters(controllerId, values) {
      const state = requireController(controllerId);
      for (const [parameterId, value] of Object.entries(values)) {
        if (setAnimatorParameter(state, parameterId, value)) {
          traceStore.push("parameter", "animator.parameter_changed", controllerId, {
            parameterId,
            value
          });
        }
      }
    },
    trigger(controllerId, oneShotId) {
      const records = triggerAnimatorOneShot(
        requireController(controllerId),
        oneShotId,
        elapsed,
        limits.maxQueuedOneShots
      );
      traceOneShotRecords(controllerId, records);
    },
    syncGameplayPhase(controllerId, phase) {
      const result = syncAnimatorGameplayPhase(requireController(controllerId), phase, elapsed);
      applyGameplayPhaseResult(controllerId, result);
    },
    cancelGameplayPhase(controllerId, executionId) {
      const state = requireController(controllerId);
      if (cancelAnimatorGameplayPhase(state, executionId, elapsed)) {
        traceStore.push("phase", "animator.phase_cancelled", controllerId, { executionId });
      }
    },
    reset(controllerId, generation) {
      const state = requireController(controllerId);
      const nextGeneration = resetAnimatorControllerState(state, elapsed, generation);
      options.adapter.reset?.(controllerId, nextGeneration);
      traceStore.push("lifecycle", "animator.controller_reset", controllerId, {
        generation: nextGeneration
      });
    },
    getController(controllerId) {
      const state = controllers.get(controllerId);
      return state === undefined ? undefined : projectAnimatorControllerSnapshot(state);
    },
    listControllers() {
      return sortedControllers().map(projectAnimatorControllerSnapshot);
    },
    update(deltaMs, elapsedMs) {
      if (disposed) {
        return;
      }
      const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
      elapsed = Number.isFinite(elapsedMs) ? Math.max(elapsed, elapsedMs) : elapsed + delta;
      const frames: AnimationPlaybackFrame[] = [];
      for (const state of sortedControllers()) {
        const update = updateAnimatorController(
          state,
          elapsed,
          limits.markerHistoryLimit,
          limits.maxMarkerEventsPerControllerUpdate
        );
        for (const transition of update.transitions) {
          traceStore.push("transition", "animator.state_transition", state.binding.controllerId, {
            layerId: transition.layerId,
            from: transition.from,
            to: transition.to
          });
        }
        if (update.markerTruncations.length > 0) {
          traceStore.push(
            "diagnostic",
            "animator.marker_catch_up_truncated",
            state.binding.controllerId,
            {
              layers: update.markerTruncations.join(","),
              limit: limits.maxMarkerEventsPerControllerUpdate
            }
          );
        }
        publishMarkers(update.markers);
        traceOneShotRecords(state.binding.controllerId, update.oneShots);
        if (update.frame !== undefined) {
          frames.push(update.frame);
        }
      }
      applyFrames(frames);
    },
    snapshot() {
      const controllerSnapshots = sortedControllers().map(projectAnimatorControllerSnapshot);
      return {
        id,
        elapsed,
        disposed,
        controllers: controllerSnapshots,
        dirtyControllers: controllerSnapshots.filter((controller) => controller.dirty).length,
        activeOneShots: controllerSnapshots.reduce(
          (total, controller) =>
            total + controller.layers.filter((layer) => layer.activeOneShotId !== undefined).length,
          0
        ),
        activeGameplayPhases: controllerSnapshots.reduce(
          (total, controller) =>
            total +
            controller.layers.filter((layer) => layer.phaseExecutionId !== undefined).length,
          0
        ),
        queuedOneShots: controllerSnapshots.reduce(
          (total, controller) =>
            total + controller.layers.reduce((sum, layer) => sum + layer.queuedOneShots, 0),
          0
        ),
        emittedMarkers,
        appliedFrames,
        traceEntries: traceStore.size(),
        adapter: options.adapter.snapshot()
      };
    },
    traces() {
      return traceStore.entries();
    },
    dispose() {
      if (disposed) {
        return;
      }
      for (const controllerId of [...controllers.keys()].sort()) {
        options.adapter.unbind(controllerId);
      }
      controllers.clear();
      traceStore.clear();
      disposed = true;
    }
  };
  return runtime;

  function requireController(controllerId: string): AnimatorControllerState {
    const state = controllers.get(controllerId);
    if (state === undefined) {
      throw createAnimatorError(
        "animator.controller_missing",
        `Animator controller is not bound: ${controllerId}`,
        { controllerId }
      );
    }
    return state;
  }

  function sortedControllers(): AnimatorControllerState[] {
    return [...controllers.values()].sort((left, right) =>
      left.binding.controllerId.localeCompare(right.binding.controllerId)
    );
  }

  function publishMarkers(markers: AnimatorMarkerEvent[]): void {
    for (const marker of markers) {
      emittedMarkers += 1;
      if (options.onMarker !== undefined) {
        try {
          options.onMarker(cloneAnimatorMarker(marker));
        } catch (error) {
          notifyMarkerError(error, marker);
        }
      }
      try {
        options.eventBus?.emit("animator.marker", cloneAnimatorMarker(marker), id);
      } catch (error) {
        notifyMarkerError(error, marker);
        traceStore.push(
          "diagnostic",
          "animator.marker_event_bus_listener_failed",
          marker.controllerId,
          {
            layerId: marker.layerId,
            clipId: marker.clipId,
            markerId: marker.markerId
          }
        );
      }
      traceStore.push("marker", "animator.marker_emitted", marker.controllerId, {
        layerId: marker.layerId,
        clipId: marker.clipId,
        markerId: marker.markerId,
        ...(marker.executionId === undefined ? {} : { executionId: marker.executionId })
      });
    }
  }

  function notifyMarkerError(error: unknown, marker: AnimatorMarkerEvent): void {
    try {
      options.onMarkerError?.(error, cloneAnimatorMarker(marker));
    } catch {
      // Marker observers cannot change playback state.
    }
  }

  function applyFrames(frames: AnimationPlaybackFrame[]): void {
    if (frames.length === 0) {
      return;
    }
    if (options.adapter.applyBatch !== undefined) {
      options.adapter.applyBatch(frames);
    } else {
      for (const frame of frames) {
        options.adapter.apply(frame.controllerId, frame);
      }
    }
    appliedFrames += frames.length;
    traceStore.push("playback", "animator.batch_applied", undefined, { frames: frames.length });
  }

  function applyGameplayPhaseResult(
    controllerId: string,
    result: AnimatorGameplayPhaseSyncResult
  ): void {
    if (result.status === "stale") {
      traceStore.push("diagnostic", "animator.stale_phase_ignored", controllerId, {
        executionId: result.executionId,
        generation: result.generation,
        currentGeneration: result.currentGeneration
      });
      return;
    }
    if (result.resetGeneration !== undefined) {
      options.adapter.reset?.(controllerId, result.resetGeneration);
      traceStore.push("lifecycle", "animator.controller_reset", controllerId, {
        generation: result.resetGeneration
      });
    }
    if (result.status === "mapping-missing") {
      traceStore.push("diagnostic", "animator.phase_mapping_missing", controllerId, {
        abilityId: result.abilityId,
        phase: result.phase
      });
      return;
    }
    traceStore.push("phase", "animator.phase_synced", controllerId, {
      executionId: result.executionId,
      abilityId: result.abilityId,
      phase: result.phase,
      seekTimeMs: result.seekTimeMs,
      predicted: result.predicted
    });
  }

  function traceOneShotRecords(controllerId: string, records: AnimatorOneShotRecord[]): void {
    for (const record of records) {
      switch (record.kind) {
        case "started":
          traceStore.push("one-shot", "animator.one_shot_started", controllerId, {
            oneShotId: record.oneShotId,
            layerId: record.layerId
          });
          break;
        case "completed":
          traceStore.push("one-shot", "animator.one_shot_completed", controllerId, {
            oneShotId: record.oneShotId,
            layerId: record.layerId
          });
          break;
        case "queue-full":
          traceStore.push("diagnostic", "animator.one_shot_queue_full", controllerId, {
            oneShotId: record.oneShotId,
            layerId: record.layerId
          });
          break;
      }
    }
  }

  function requireActive(): void {
    if (disposed) {
      throw createAnimatorError("animator.invalid_config", "Animator runtime is disposed");
    }
  }
}
