import { ANIMATION_CLIP_TYPE, ANIMATOR_BINDING_TYPE, ANIMATOR_GRAPH_TYPE } from "../data";
import { createAnimatorError } from "./errors";
import type {
  AnimationClipDefinition,
  AnimationPlaybackFrame,
  AnimationPlaybackLayerFrame,
  AnimatorBindingDefinition,
  AnimatorConditionOperator,
  AnimatorControllerBinding,
  AnimatorControllerSnapshot,
  AnimatorGameplayPhase,
  AnimatorGraphDefinition,
  AnimatorLayerDefinition,
  AnimatorLayerSnapshot,
  AnimatorMarkerEvent,
  AnimatorOneShotDefinition,
  AnimatorParameterDefinition,
  AnimatorParameterValue,
  AnimatorPhaseMapping,
  AnimatorRuntime,
  AnimatorStateDefinition,
  AnimatorTraceEntry,
  AnimatorTraceKind,
  AnimatorTransitionCondition,
  AnimatorTransitionDefinition,
  CreateAnimatorRuntimeOptions
} from "./types";

type ActiveOneShot = {
  definition: AnimatorOneShotDefinition;
  startedAt: number;
  lastTimeMs: number;
};

type ActiveGameplayPhase = {
  phase: AnimatorGameplayPhase;
  mapping: AnimatorPhaseMapping;
  lastTimeMs: number;
  seek: boolean;
};

type CompiledTransition = {
  definition: AnimatorTransitionDefinition;
  sourceIndex: number;
};

type LayerState = {
  definition: AnimatorLayerDefinition;
  states: Map<string, AnimatorStateDefinition>;
  transitions: CompiledTransition[];
  stateId: string;
  stateEnteredAt: number;
  lastStateTimeMs: number;
  oneShot: ActiveOneShot | undefined;
  queuedOneShots: string[];
  gameplayPhase: ActiveGameplayPhase | undefined;
  playbackSerial: number;
};

type ControllerState = {
  binding: AnimatorControllerBinding;
  definition: AnimatorBindingDefinition;
  clips: Map<string, AnimationClipDefinition>;
  oneShots: Map<string, AnimatorOneShotDefinition>;
  parameters: Map<string, AnimatorParameterValue>;
  parameterDefinitions: Map<string, AnimatorParameterDefinition>;
  triggers: Set<string>;
  layers: Map<string, LayerState>;
  generation: number;
  dirty: boolean;
  reasons: Set<string>;
  markerKeys: Set<string>;
  markerOrder: string[];
  emittedMarkers: number;
};

export function createAnimatorRuntime(options: CreateAnimatorRuntimeOptions): AnimatorRuntime {
  const id = options.id ?? "animator";
  const maxControllers = positiveInteger(options.maxControllers, 2_048);
  const maxQueuedOneShots = nonNegativeInteger(options.maxQueuedOneShotsPerController, 4);
  const markerHistoryLimit = nonNegativeInteger(options.markerHistoryLimit, 512);
  const traceLimit = nonNegativeInteger(options.traceLimit, 512);
  const controllers = new Map<string, ControllerState>();
  const traces: AnimatorTraceEntry[] = [];
  let traceSequence = 0;
  let elapsed = 0;
  let disposed = false;
  let appliedFrames = 0;
  let emittedMarkers = 0;

  pushTrace("lifecycle", "animator.created");

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
      if (controllers.size >= maxControllers) {
        throw createAnimatorError("animator.limit_exceeded", "Animator controller limit exceeded", {
          maxControllers
        });
      }
      const definition = definitionFor<AnimatorBindingDefinition>(
        ANIMATOR_BINDING_TYPE,
        binding.bindingId
      );
      const graph = definitionFor<AnimatorGraphDefinition>(
        ANIMATOR_GRAPH_TYPE,
        definition.graph.id
      );
      const state = createControllerState(binding, definition, graph);
      validateControllerDefinitions(state);
      options.adapter.bind(
        binding.controllerId,
        cloneBindingDefinition(definition),
        binding.renderObjectId
      );
      controllers.set(binding.controllerId, state);
      pushTrace("lifecycle", "animator.controller_bound", binding.controllerId, {
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
      pushTrace("lifecycle", "animator.controller_unbound", controllerId);
    },
    hasController(controllerId) {
      return controllers.has(controllerId);
    },
    setParameter(controllerId, parameterId, value) {
      setParameter(requireController(controllerId), parameterId, value);
    },
    setParameters(controllerId, values) {
      const state = requireController(controllerId);
      for (const [parameterId, value] of Object.entries(values)) {
        setParameter(state, parameterId, value);
      }
    },
    trigger(controllerId, oneShotId) {
      triggerOneShot(requireController(controllerId), oneShotId);
    },
    syncGameplayPhase(controllerId, phase) {
      syncPhase(requireController(controllerId), phase);
    },
    cancelGameplayPhase(controllerId, executionId) {
      const state = requireController(controllerId);
      let changed = false;
      for (const layer of state.layers.values()) {
        if (layer.gameplayPhase?.phase.executionId === executionId) {
          layer.gameplayPhase = undefined;
          layer.playbackSerial += 1;
          changed = true;
        }
      }
      if (changed) {
        markDirty(state, "phase-cancelled");
        pushTrace("phase", "animator.phase_cancelled", controllerId, { executionId });
      }
    },
    reset(controllerId, generation) {
      resetController(requireController(controllerId), generation);
    },
    getController(controllerId) {
      const state = controllers.get(controllerId);
      return state === undefined ? undefined : controllerSnapshot(state);
    },
    listControllers() {
      return sortedControllers().map(controllerSnapshot);
    },
    update(deltaMs, elapsedMs) {
      if (disposed) {
        return;
      }
      const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
      elapsed = Number.isFinite(elapsedMs) ? Math.max(elapsed, elapsedMs) : elapsed + delta;
      const frames: AnimationPlaybackFrame[] = [];
      for (const state of sortedControllers()) {
        const markers: AnimatorMarkerEvent[] = [];
        const wasDirty = state.dirty;
        evaluateTransitions(state);
        for (const layer of state.layers.values()) {
          updateLayer(state, layer, markers);
        }
        if (
          wasDirty ||
          state.dirty ||
          markers.length > 0 ||
          [...state.layers.values()].some(
            (layer) => layer.oneShot !== undefined || layer.gameplayPhase !== undefined
          )
        ) {
          frames.push(createPlaybackFrame(state, markers));
        }
        state.dirty = false;
        state.reasons.clear();
        state.triggers.clear();
      }
      if (frames.length > 0) {
        if (options.adapter.applyBatch !== undefined) {
          options.adapter.applyBatch(frames);
        } else {
          for (const frame of frames) {
            options.adapter.apply(frame.controllerId, frame);
          }
        }
        appliedFrames += frames.length;
        pushTrace("playback", "animator.batch_applied", undefined, { frames: frames.length });
      }
    },
    snapshot() {
      const controllerSnapshots = sortedControllers().map(controllerSnapshot);
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
            total +
            controller.layers.reduce((layerTotal, layer) => layerTotal + layer.queuedOneShots, 0),
          0
        ),
        emittedMarkers,
        appliedFrames,
        traceEntries: traces.length,
        adapter: options.adapter.snapshot()
      };
    },
    traces() {
      return traces.map(cloneTrace);
    },
    dispose() {
      if (disposed) {
        return;
      }
      for (const controllerId of [...controllers.keys()].sort()) {
        options.adapter.unbind(controllerId);
      }
      controllers.clear();
      traces.length = 0;
      disposed = true;
    }
  };
  return runtime;

  function createControllerState(
    binding: AnimatorControllerBinding,
    definition: AnimatorBindingDefinition,
    graph: AnimatorGraphDefinition
  ): ControllerState {
    const compiledGraph = cloneGraphDefinition(graph);
    const compiledBinding = cloneBindingDefinition(definition);
    const parameterDefinitions = new Map(
      compiledGraph.parameters.map((parameter) => [parameter.id, parameter])
    );
    const oneShots = new Map(
      (compiledGraph.oneShots ?? []).map((oneShot) => [oneShot.id, oneShot])
    );
    if (parameterDefinitions.size !== compiledGraph.parameters.length) {
      throw createAnimatorError(
        "animator.invalid_config",
        `Animator graph contains duplicate parameters: ${compiledGraph.id}`
      );
    }
    if (oneShots.size !== (compiledGraph.oneShots?.length ?? 0)) {
      throw createAnimatorError(
        "animator.invalid_config",
        `Animator graph contains duplicate one-shots: ${compiledGraph.id}`
      );
    }
    const clips = new Map<string, AnimationClipDefinition>();
    for (const [alias, reference] of Object.entries(compiledBinding.clips)) {
      clips.set(
        alias,
        cloneClipDefinition(
          definitionFor<AnimationClipDefinition>(ANIMATION_CLIP_TYPE, reference.id)
        )
      );
    }
    const parameters = new Map<string, AnimatorParameterValue>();
    for (const parameter of compiledGraph.parameters) {
      if (parameter.type !== "trigger") {
        parameters.set(parameter.id, defaultParameterValue(parameter));
      }
    }
    return {
      binding: { ...binding },
      definition: compiledBinding,
      clips,
      oneShots,
      parameters,
      parameterDefinitions,
      triggers: new Set(),
      layers: new Map<string, LayerState>(
        compiledGraph.layers.map((layer): [string, LayerState] => {
          const states = new Map(layer.states.map((state) => [state.id, state]));
          if (states.size !== layer.states.length) {
            throw createAnimatorError(
              "animator.invalid_config",
              `Animator layer contains duplicate states: ${compiledGraph.id}/${layer.id}`
            );
          }
          const transitions = (layer.transitions ?? [])
            .map((transition, sourceIndex) => ({ definition: transition, sourceIndex }))
            .sort((left, right) =>
              (right.definition.priority ?? 0) === (left.definition.priority ?? 0)
                ? left.sourceIndex - right.sourceIndex
                : (right.definition.priority ?? 0) - (left.definition.priority ?? 0)
            );
          return [
            layer.id,
            {
              definition: layer,
              states,
              transitions,
              stateId: layer.initialState,
              stateEnteredAt: elapsed,
              lastStateTimeMs: 0,
              oneShot: undefined,
              queuedOneShots: [],
              gameplayPhase: undefined,
              playbackSerial: 0
            }
          ];
        })
      ),
      generation: binding.generation ?? 0,
      dirty: true,
      reasons: new Set(["bind"]),
      markerKeys: new Set(),
      markerOrder: [],
      emittedMarkers: 0
    };
  }

  function validateControllerDefinitions(state: ControllerState): void {
    for (const layer of state.layers.values()) {
      if (!layer.states.has(layer.definition.initialState)) {
        throw createAnimatorError(
          "animator.definition_missing",
          `Animator initial state is missing: ${layer.definition.id}/${layer.definition.initialState}`
        );
      }
      for (const graphState of layer.states.values()) {
        requireClipAlias(state, graphState.clip);
      }
    }
    for (const oneShot of state.oneShots.values()) {
      requireClipAlias(state, oneShot.clip);
      if (!state.layers.has(oneShot.layer)) {
        throw createAnimatorError(
          "animator.definition_missing",
          `Animator one-shot layer is missing: ${oneShot.layer}`
        );
      }
    }
    for (const mapping of state.definition.phaseMappings ?? []) {
      requireClipAlias(state, mapping.clip);
      if (!state.layers.has(mapping.layer)) {
        throw createAnimatorError(
          "animator.definition_missing",
          `Animator phase mapping layer is missing: ${mapping.layer}`
        );
      }
    }
  }

  function setParameter(
    state: ControllerState,
    parameterId: string,
    value: AnimatorParameterValue
  ): void {
    const definition = state.parameterDefinitions.get(parameterId);
    if (definition === undefined || definition.type === "trigger") {
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator parameter is missing or is a trigger: ${parameterId}`,
        { controllerId: state.binding.controllerId, parameterId }
      );
    }
    if (!parameterValueMatches(definition, value)) {
      throw createAnimatorError("animator.invalid_config", "Animator parameter type mismatch", {
        controllerId: state.binding.controllerId,
        parameterId,
        expected: definition.type,
        actual: typeof value
      });
    }
    if (Object.is(state.parameters.get(parameterId), value)) {
      return;
    }
    state.parameters.set(parameterId, value);
    markDirty(state, `parameter:${parameterId}`);
    pushTrace("parameter", "animator.parameter_changed", state.binding.controllerId, {
      parameterId,
      value
    });
  }

  function triggerOneShot(state: ControllerState, oneShotId: string): void {
    const definition = state.oneShots.get(oneShotId);
    if (definition === undefined) {
      const parameter = state.parameterDefinitions.get(oneShotId);
      if (parameter?.type === "trigger") {
        state.triggers.add(oneShotId);
        markDirty(state, `trigger:${oneShotId}`);
        return;
      }
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator one-shot is missing: ${oneShotId}`,
        { controllerId: state.binding.controllerId, oneShotId }
      );
    }
    const layer = state.layers.get(definition.layer);
    if (layer === undefined) {
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator one-shot layer is missing: ${definition.layer}`
      );
    }
    if (layer.gameplayPhase !== undefined) {
      enqueueOneShot(state, layer, definition);
      return;
    }
    const active = layer.oneShot;
    if (active === undefined) {
      startOneShot(state, layer, definition);
      return;
    }
    if (active.definition.id === oneShotId) {
      switch (definition.repeat ?? "ignore") {
        case "ignore":
        case "merge":
          return;
        case "restart":
          startOneShot(state, layer, definition);
          return;
        case "queue-one":
          if (!layer.queuedOneShots.includes(oneShotId)) {
            enqueueOneShot(state, layer, definition);
          }
          return;
      }
    }
    const activePolicy = active.definition.interrupt ?? "higher-priority";
    const canInterrupt =
      activePolicy === "always" ||
      (activePolicy === "higher-priority" &&
        (definition.priority ?? 0) > (active.definition.priority ?? 0));
    if (canInterrupt) {
      startOneShot(state, layer, definition);
    } else {
      enqueueOneShot(state, layer, definition);
    }
  }

  function enqueueOneShot(
    state: ControllerState,
    layer: LayerState,
    definition: AnimatorOneShotDefinition
  ): void {
    const controllerQueued = [...state.layers.values()].reduce(
      (total, candidate) => total + candidate.queuedOneShots.length,
      0
    );
    const layerLimit = Math.min(definition.maxQueue ?? 1, maxQueuedOneShots);
    if (controllerQueued >= maxQueuedOneShots || layer.queuedOneShots.length >= layerLimit) {
      pushTrace("diagnostic", "animator.one_shot_queue_full", state.binding.controllerId, {
        oneShotId: definition.id,
        layerId: layer.definition.id
      });
      return;
    }
    layer.queuedOneShots.push(definition.id);
    markDirty(state, `one-shot-queued:${definition.id}`);
  }

  function startOneShot(
    state: ControllerState,
    layer: LayerState,
    definition: AnimatorOneShotDefinition
  ): void {
    layer.oneShot = { definition: { ...definition }, startedAt: elapsed, lastTimeMs: 0 };
    layer.playbackSerial += 1;
    markDirty(state, `one-shot:${definition.id}`);
    pushTrace("one-shot", "animator.one_shot_started", state.binding.controllerId, {
      oneShotId: definition.id,
      layerId: definition.layer
    });
  }

  function syncPhase(state: ControllerState, phase: AnimatorGameplayPhase): void {
    if (
      !phase.executionId ||
      !phase.abilityId ||
      !phase.phase ||
      !Number.isFinite(phase.startedAt) ||
      (phase.durationMs !== undefined &&
        (!Number.isFinite(phase.durationMs) || phase.durationMs < 0)) ||
      (phase.generation !== undefined &&
        (!Number.isSafeInteger(phase.generation) || phase.generation < 0))
    ) {
      throw createAnimatorError("animator.invalid_config", "Animator gameplay phase is invalid", {
        controllerId: state.binding.controllerId,
        executionId: phase.executionId
      });
    }
    if (phase.generation !== undefined && phase.generation < state.generation) {
      pushTrace("diagnostic", "animator.stale_phase_ignored", state.binding.controllerId, {
        executionId: phase.executionId,
        generation: phase.generation,
        currentGeneration: state.generation
      });
      return;
    }
    if (phase.generation !== undefined && phase.generation > state.generation) {
      resetController(state, phase.generation);
    }
    const mapping = phaseMappingFor(state.definition, phase);
    if (mapping === undefined) {
      pushTrace("diagnostic", "animator.phase_mapping_missing", state.binding.controllerId, {
        abilityId: phase.abilityId,
        phase: phase.phase
      });
      return;
    }
    const layer = state.layers.get(mapping.layer);
    if (layer === undefined) {
      return;
    }
    const clip = clipForAlias(state, mapping.clip);
    const speed = phasePlaybackSpeed(phase, mapping, clip);
    const currentTime = Math.max(0, elapsed - phase.startedAt) * speed;
    layer.gameplayPhase = {
      phase: { ...phase },
      mapping: { ...mapping },
      lastTimeMs: currentTime,
      seek: true
    };
    layer.oneShot = undefined;
    layer.queuedOneShots.length = 0;
    layer.playbackSerial += 1;
    markDirty(state, `phase:${phase.phase}`);
    pushTrace("phase", "animator.phase_synced", state.binding.controllerId, {
      executionId: phase.executionId,
      abilityId: phase.abilityId,
      phase: phase.phase,
      seekTimeMs: currentTime,
      predicted: phase.predicted ?? false
    });
  }

  function resetController(state: ControllerState, generation?: number): void {
    state.generation = generation ?? state.generation + 1;
    state.parameters.clear();
    for (const parameter of state.parameterDefinitions.values()) {
      if (parameter.type !== "trigger") {
        state.parameters.set(parameter.id, defaultParameterValue(parameter));
      }
    }
    state.triggers.clear();
    for (const layer of state.layers.values()) {
      layer.stateId = layer.definition.initialState;
      layer.stateEnteredAt = elapsed;
      layer.lastStateTimeMs = 0;
      layer.oneShot = undefined;
      layer.queuedOneShots.length = 0;
      layer.gameplayPhase = undefined;
      layer.playbackSerial += 1;
    }
    state.markerKeys.clear();
    state.markerOrder.length = 0;
    options.adapter.reset?.(state.binding.controllerId, state.generation);
    markDirty(state, "reset");
    pushTrace("lifecycle", "animator.controller_reset", state.binding.controllerId, {
      generation: state.generation
    });
  }

  function evaluateTransitions(state: ControllerState): void {
    if (!state.dirty && state.triggers.size === 0) {
      return;
    }
    for (const layer of state.layers.values()) {
      if (layer.gameplayPhase !== undefined || layer.oneShot !== undefined) {
        continue;
      }
      const transition = layer.transitions.find(
        ({ definition }) =>
          (definition.from === "*" || definition.from === layer.stateId) &&
          definition.to !== layer.stateId &&
          definition.conditions.every((condition) => conditionMatches(state, condition))
      )?.definition;
      if (transition === undefined) {
        continue;
      }
      const previous = layer.stateId;
      layer.stateId = transition.to;
      layer.stateEnteredAt = elapsed;
      layer.lastStateTimeMs = 0;
      layer.playbackSerial += 1;
      markDirty(state, `transition:${previous}->${transition.to}`);
      pushTrace("transition", "animator.state_transition", state.binding.controllerId, {
        layerId: layer.definition.id,
        from: previous,
        to: transition.to
      });
    }
  }

  function updateLayer(
    state: ControllerState,
    layer: LayerState,
    markers: AnimatorMarkerEvent[]
  ): void {
    if (layer.gameplayPhase !== undefined) {
      const active = layer.gameplayPhase;
      const clip = clipForAlias(state, active.mapping.clip);
      const speed = phasePlaybackSpeed(active.phase, active.mapping, clip);
      const rawTime = Math.max(0, elapsed - active.phase.startedAt) * speed;
      emitMarkersForRange(
        state,
        layer,
        clip,
        active.lastTimeMs,
        rawTime,
        active.mapping.loop ?? clip.loop ?? false,
        markers,
        active.phase.executionId
      );
      active.lastTimeMs = rawTime;
      return;
    }
    if (layer.oneShot !== undefined) {
      const active = layer.oneShot;
      const clip = clipForAlias(state, active.definition.clip);
      const speed = active.definition.speed ?? 1;
      const rawTime = Math.max(0, elapsed - active.startedAt) * speed;
      emitMarkersForRange(
        state,
        layer,
        clip,
        active.lastTimeMs,
        Math.min(rawTime, clip.durationMs),
        false,
        markers
      );
      active.lastTimeMs = rawTime;
      if (rawTime >= clip.durationMs) {
        const completedId = active.definition.id;
        layer.oneShot = undefined;
        const nextId = layer.queuedOneShots.shift();
        if (nextId !== undefined) {
          const next = state.oneShots.get(nextId);
          if (next !== undefined) {
            startOneShot(state, layer, next);
          }
        } else {
          layer.playbackSerial += 1;
          layer.stateEnteredAt = elapsed;
          layer.lastStateTimeMs = 0;
          markDirty(state, `one-shot-complete:${completedId}`);
        }
        pushTrace("one-shot", "animator.one_shot_completed", state.binding.controllerId, {
          oneShotId: completedId,
          layerId: layer.definition.id
        });
      }
      return;
    }
    const graphState = stateForLayer(layer);
    const clip = clipForAlias(state, graphState.clip);
    const speed = graphState.speed ?? 1;
    const rawTime = Math.max(0, elapsed - layer.stateEnteredAt) * speed;
    emitMarkersForRange(
      state,
      layer,
      clip,
      layer.lastStateTimeMs,
      rawTime,
      graphState.loop ?? clip.loop ?? false,
      markers
    );
    layer.lastStateTimeMs = rawTime;
  }

  function emitMarkersForRange(
    state: ControllerState,
    layer: LayerState,
    clip: AnimationClipDefinition,
    previousTime: number,
    currentTime: number,
    loop: boolean,
    output: AnimatorMarkerEvent[],
    executionId?: string
  ): void {
    if (currentTime <= previousTime || clip.markers === undefined || clip.markers.length === 0) {
      return;
    }
    const duration = clip.durationMs;
    const firstCycle = loop ? Math.floor(previousTime / duration) : 0;
    const lastCycle = loop ? Math.floor(currentTime / duration) : 0;
    for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
      const cycleStart = loop ? cycle * duration : 0;
      for (const marker of clip.markers) {
        const absoluteTime = cycleStart + marker.timeMs;
        if (absoluteTime <= previousTime || absoluteTime > currentTime) {
          continue;
        }
        const markerKey = `${state.generation}:${layer.definition.id}:${layer.playbackSerial}:${cycle}:${marker.id}`;
        if (state.markerKeys.has(markerKey)) {
          continue;
        }
        retainMarkerKey(state, markerKey);
        const event: AnimatorMarkerEvent = {
          id: `${state.binding.controllerId}:${markerKey}`,
          controllerId: state.binding.controllerId,
          layerId: layer.definition.id,
          clipId: clip.id,
          markerId: marker.id,
          timestamp: elapsed,
          generation: state.generation,
          ...(executionId === undefined ? {} : { executionId }),
          ...(marker.tags === undefined ? {} : { tags: [...marker.tags] })
        };
        output.push(cloneMarker(event));
        state.emittedMarkers += 1;
        emittedMarkers += 1;
        if (options.onMarker !== undefined) {
          try {
            options.onMarker(cloneMarker(event));
          } catch (error) {
            try {
              options.onMarkerError?.(error, cloneMarker(event));
            } catch {
              // Marker observers cannot change playback state.
            }
          }
        }
        options.eventBus?.emit("animator.marker", cloneMarker(event), id);
        pushTrace("marker", "animator.marker_emitted", state.binding.controllerId, {
          layerId: layer.definition.id,
          clipId: clip.id,
          markerId: marker.id,
          ...(executionId === undefined ? {} : { executionId })
        });
      }
    }
  }

  function createPlaybackFrame(
    state: ControllerState,
    markers: AnimatorMarkerEvent[]
  ): AnimationPlaybackFrame {
    const layers = [...state.layers.values()]
      .sort((left, right) =>
        (left.definition.priority ?? 0) === (right.definition.priority ?? 0)
          ? left.definition.id.localeCompare(right.definition.id)
          : (left.definition.priority ?? 0) - (right.definition.priority ?? 0)
      )
      .map((layer) => playbackLayerFrame(state, layer));
    return {
      controllerId: state.binding.controllerId,
      renderObjectId: state.binding.renderObjectId,
      generation: state.generation,
      timestamp: elapsed,
      layers,
      markers: markers.map((marker) => ({ ...marker })),
      reasons: [...state.reasons].sort()
    };
  }

  function playbackLayerFrame(
    state: ControllerState,
    layer: LayerState
  ): AnimationPlaybackLayerFrame {
    if (layer.gameplayPhase !== undefined) {
      const active = layer.gameplayPhase;
      const clip = clipForAlias(state, active.mapping.clip);
      const speed = phasePlaybackSpeed(active.phase, active.mapping, clip);
      const rawTime = Math.max(0, elapsed - active.phase.startedAt) * speed;
      const loop = active.mapping.loop ?? clip.loop ?? false;
      const frame = layerFrame(layer, clip, "gameplay-phase", rawTime, speed, loop, active.seek);
      active.seek = false;
      return frame;
    }
    if (layer.oneShot !== undefined) {
      const active = layer.oneShot;
      const clip = clipForAlias(state, active.definition.clip);
      const speed = active.definition.speed ?? 1;
      return layerFrame(
        layer,
        clip,
        "one-shot",
        Math.max(0, elapsed - active.startedAt) * speed,
        speed,
        false,
        state.dirty
      );
    }
    const graphState = stateForLayer(layer);
    const clip = clipForAlias(state, graphState.clip);
    const speed = graphState.speed ?? 1;
    return {
      ...layerFrame(
        layer,
        clip,
        "state",
        Math.max(0, elapsed - layer.stateEnteredAt) * speed,
        speed,
        graphState.loop ?? clip.loop ?? false,
        state.dirty
      ),
      stateId: graphState.id
    };
  }

  function layerFrame(
    layer: LayerState,
    clip: AnimationClipDefinition,
    kind: AnimationPlaybackLayerFrame["kind"],
    rawTime: number,
    speed: number,
    loop: boolean,
    seek: boolean
  ): AnimationPlaybackLayerFrame {
    const timeMs = loop ? rawTime % clip.durationMs : Math.min(rawTime, clip.durationMs);
    return {
      layerId: layer.definition.id,
      clipId: clip.id,
      ...(clip.backendClip === undefined ? {} : { backendClip: clip.backendClip }),
      asset: { ...clip.asset },
      kind,
      timeMs,
      normalizedTime: Math.max(0, Math.min(1, timeMs / clip.durationMs)),
      speed,
      loop,
      weight: layer.definition.weight ?? 1,
      mode: layer.definition.mode ?? "replace",
      ...(layer.definition.target === undefined
        ? {}
        : { target: cloneTarget(layer.definition.target) }),
      seek
    };
  }

  function conditionMatches(
    state: ControllerState,
    condition: AnimatorTransitionCondition
  ): boolean {
    if (condition.operator === "triggered") {
      return state.triggers.has(condition.parameter);
    }
    const actual = state.parameters.get(condition.parameter);
    return compare(actual, condition.operator, condition.value);
  }

  function clipForAlias(state: ControllerState, alias: string): AnimationClipDefinition {
    const resolvedAlias =
      state.clips.get(alias) === undefined ? state.definition.fallbackClip : alias;
    if (resolvedAlias === undefined) {
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator clip alias is missing: ${alias}`,
        { controllerId: state.binding.controllerId, bindingId: state.definition.id }
      );
    }
    const clip = state.clips.get(resolvedAlias);
    if (clip === undefined) {
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator fallback clip alias is missing: ${resolvedAlias}`
      );
    }
    return clip;
  }

  function requireClipAlias(state: ControllerState, alias: string): void {
    clipForAlias(state, alias);
  }

  function stateForLayer(layer: LayerState): AnimatorStateDefinition {
    const state = layer.states.get(layer.stateId);
    if (state === undefined) {
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator state is missing: ${layer.definition.id}/${layer.stateId}`
      );
    }
    return state;
  }

  function definitionFor<T>(type: string, definitionId: string): T {
    if (!options.dataRegistry.has(type, definitionId)) {
      throw createAnimatorError(
        "animator.definition_missing",
        `Animator definition is missing: ${type}/${definitionId}`
      );
    }
    return options.dataRegistry.getValue<T>(type, definitionId);
  }

  function requireController(controllerId: string): ControllerState {
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

  function sortedControllers(): ControllerState[] {
    return [...controllers.values()].sort((left, right) =>
      left.binding.controllerId.localeCompare(right.binding.controllerId)
    );
  }

  function controllerSnapshot(state: ControllerState): AnimatorControllerSnapshot {
    return {
      binding: { ...state.binding },
      generation: state.generation,
      parameters: Object.fromEntries(
        [...state.parameters.entries()].sort(([left], [right]) => left.localeCompare(right))
      ),
      layers: [...state.layers.values()]
        .sort((left, right) => left.definition.id.localeCompare(right.definition.id))
        .map(layerSnapshot),
      dirty: state.dirty,
      emittedMarkers: state.emittedMarkers
    };
  }

  function layerSnapshot(layer: LayerState): AnimatorLayerSnapshot {
    return {
      layerId: layer.definition.id,
      stateId: layer.stateId,
      stateEnteredAt: layer.stateEnteredAt,
      ...(layer.oneShot === undefined ? {} : { activeOneShotId: layer.oneShot.definition.id }),
      queuedOneShots: layer.queuedOneShots.length,
      ...(layer.gameplayPhase === undefined
        ? {}
        : { phaseExecutionId: layer.gameplayPhase.phase.executionId })
    };
  }

  function markDirty(state: ControllerState, reason: string): void {
    state.dirty = true;
    state.reasons.add(reason);
  }

  function retainMarkerKey(state: ControllerState, key: string): void {
    if (markerHistoryLimit === 0) {
      return;
    }
    state.markerKeys.add(key);
    state.markerOrder.push(key);
    while (state.markerOrder.length > markerHistoryLimit) {
      const removed = state.markerOrder.shift();
      if (removed !== undefined) {
        state.markerKeys.delete(removed);
      }
    }
  }

  function pushTrace(
    kind: AnimatorTraceKind,
    label: string,
    controllerId?: string,
    payload?: Record<string, unknown>
  ): void {
    if (traceLimit === 0) {
      return;
    }
    const entry: AnimatorTraceEntry = {
      sequence: traceSequence,
      kind,
      label,
      timestamp: elapsed,
      ...(controllerId === undefined ? {} : { controllerId }),
      ...(payload === undefined ? {} : { payload: { ...payload } })
    };
    traces.push(entry);
    traceSequence += 1;
    if (traces.length > traceLimit) {
      traces.splice(0, traces.length - traceLimit);
    }
    if (options.onTrace !== undefined) {
      try {
        options.onTrace(cloneTrace(entry));
      } catch (error) {
        try {
          options.onTraceError?.(error, cloneTrace(entry));
        } catch {
          // Trace observers are diagnostic-only and cannot change animation playback.
        }
      }
    }
  }

  function requireActive(): void {
    if (disposed) {
      throw createAnimatorError("animator.invalid_config", "Animator runtime is disposed");
    }
  }
}

function compare(
  actual: AnimatorParameterValue | undefined,
  operator: Exclude<AnimatorConditionOperator, "triggered">,
  expected: AnimatorParameterValue | undefined
): boolean {
  switch (operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case ">=":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "<":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "<=":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
  }
}

function phaseMappingFor(
  binding: AnimatorBindingDefinition,
  phase: AnimatorGameplayPhase
): AnimatorPhaseMapping | undefined {
  return (
    binding.phaseMappings?.find(
      (mapping) => mapping.phase === phase.phase && mapping.abilityId === phase.abilityId
    ) ??
    binding.phaseMappings?.find(
      (mapping) => mapping.phase === phase.phase && mapping.abilityId === undefined
    )
  );
}

function phasePlaybackSpeed(
  phase: AnimatorGameplayPhase,
  mapping: AnimatorPhaseMapping,
  clip: AnimationClipDefinition
): number {
  const declaredSpeed = mapping.speed ?? 1;
  const loops = mapping.loop ?? clip.loop ?? false;
  return !loops && phase.durationMs !== undefined && phase.durationMs > 0
    ? declaredSpeed * (clip.durationMs / phase.durationMs)
    : declaredSpeed;
}

function defaultParameterValue(definition: AnimatorParameterDefinition): AnimatorParameterValue {
  if (definition.default !== undefined) {
    return definition.default;
  }
  switch (definition.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return "";
    case "trigger":
      return false;
  }
}

function parameterValueMatches(
  definition: AnimatorParameterDefinition,
  value: AnimatorParameterValue
): boolean {
  switch (definition.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "trigger":
      return false;
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw createAnimatorError("animator.invalid_config", "Animator limit must be positive", {
      value: resolved
    });
  }
  return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createAnimatorError("animator.invalid_config", "Animator limit must be non-negative", {
      value: resolved
    });
  }
  return resolved;
}

function cloneTrace(trace: AnimatorTraceEntry): AnimatorTraceEntry {
  return {
    ...trace,
    ...(trace.payload === undefined ? {} : { payload: { ...trace.payload } })
  };
}

function cloneMarker(marker: AnimatorMarkerEvent): AnimatorMarkerEvent {
  return {
    ...marker,
    ...(marker.tags === undefined ? {} : { tags: [...marker.tags] })
  };
}

function cloneClipDefinition(clip: AnimationClipDefinition): AnimationClipDefinition {
  return {
    ...clip,
    asset: { ...clip.asset },
    ...(clip.markers === undefined
      ? {}
      : {
          markers: clip.markers.map((marker) => ({
            ...marker,
            ...(marker.tags === undefined ? {} : { tags: [...marker.tags] })
          }))
        }),
    ...(clip.tags === undefined ? {} : { tags: [...clip.tags] })
  };
}

function cloneTarget<T extends string | string[]>(target: T): T {
  return (Array.isArray(target) ? [...target] : target) as T;
}

function cloneBindingDefinition(binding: AnimatorBindingDefinition): AnimatorBindingDefinition {
  return {
    ...binding,
    graph: { ...binding.graph },
    clips: Object.fromEntries(
      Object.entries(binding.clips).map(([alias, reference]) => [alias, { ...reference }])
    ),
    ...(binding.target === undefined ? {} : { target: cloneTarget(binding.target) }),
    ...(binding.phaseMappings === undefined
      ? {}
      : { phaseMappings: binding.phaseMappings.map((mapping) => ({ ...mapping })) }),
    ...(binding.tags === undefined ? {} : { tags: [...binding.tags] })
  };
}

function cloneGraphDefinition(graph: AnimatorGraphDefinition): AnimatorGraphDefinition {
  return {
    ...graph,
    parameters: graph.parameters.map((parameter) => ({ ...parameter })),
    layers: graph.layers.map(cloneLayerDefinition),
    ...(graph.oneShots === undefined
      ? {}
      : { oneShots: graph.oneShots.map((oneShot) => ({ ...oneShot })) }),
    ...(graph.tags === undefined ? {} : { tags: [...graph.tags] })
  };
}

function cloneLayerDefinition(layer: AnimatorLayerDefinition): AnimatorLayerDefinition {
  return {
    ...layer,
    states: layer.states.map((state) => ({ ...state })),
    ...(layer.transitions === undefined
      ? {}
      : {
          transitions: layer.transitions.map((transition: AnimatorTransitionDefinition) => ({
            ...transition,
            conditions: transition.conditions.map((condition) => ({ ...condition }))
          }))
        }),
    ...(layer.target === undefined ? {} : { target: cloneTarget(layer.target) })
  };
}
