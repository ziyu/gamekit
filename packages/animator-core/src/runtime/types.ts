import type { AssetRef } from "@gamekit/asset";
import type { DataRef, DataRegistry } from "@gamekit/data";
import type { EventBus } from "@gamekit/event-bus";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { RenderNodePath, RenderObjectId } from "@gamekit/renderer-core";

export type AnimationClipMarkerDefinition = {
  id: string;
  timeMs: number;
  tags?: string[] | undefined;
};

export type AnimationClipDefinition = {
  id: string;
  asset: AssetRef;
  backendClip?: string | undefined;
  durationMs: number;
  loop?: boolean | undefined;
  markers?: AnimationClipMarkerDefinition[] | undefined;
  tags?: string[] | undefined;
};

export type AnimatorParameterType = "number" | "boolean" | "string" | "trigger";

export type AnimatorParameterDefinition = {
  id: string;
  type: AnimatorParameterType;
  default?: number | boolean | string | undefined;
};

export type AnimatorConditionOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "truthy"
  | "falsy"
  | "triggered";

export type AnimatorTransitionCondition = {
  parameter: string;
  operator: AnimatorConditionOperator;
  value?: number | boolean | string | undefined;
};

export type AnimatorStateDefinition = {
  id: string;
  clip: string;
  speed?: number | undefined;
  loop?: boolean | undefined;
};

export type AnimatorTransitionDefinition = {
  from: string | "*";
  to: string;
  conditions: AnimatorTransitionCondition[];
  priority?: number | undefined;
};

export type AnimatorLayerDefinition = {
  id: string;
  initialState: string;
  states: AnimatorStateDefinition[];
  transitions?: AnimatorTransitionDefinition[] | undefined;
  priority?: number | undefined;
  weight?: number | undefined;
  mode?: "replace" | "additive" | undefined;
  target?: RenderNodePath | undefined;
};

export type AnimatorOneShotRepeatPolicy = "ignore" | "restart" | "queue-one" | "merge";
export type AnimatorOneShotInterruptPolicy = "always" | "higher-priority" | "never";

export type AnimatorOneShotDefinition = {
  id: string;
  layer: string;
  clip: string;
  priority?: number | undefined;
  speed?: number | undefined;
  repeat?: AnimatorOneShotRepeatPolicy | undefined;
  interrupt?: AnimatorOneShotInterruptPolicy | undefined;
  maxQueue?: number | undefined;
};

export type AnimatorGraphDefinition = {
  id: string;
  parameters: AnimatorParameterDefinition[];
  layers: AnimatorLayerDefinition[];
  oneShots?: AnimatorOneShotDefinition[] | undefined;
  tags?: string[] | undefined;
};

export type AnimatorPhaseMapping = {
  phase: string;
  clip: string;
  layer: string;
  abilityId?: string | undefined;
  speed?: number | undefined;
  loop?: boolean | undefined;
};

export type AnimatorBindingDefinition = {
  id: string;
  graph: DataRef<"animator.graph">;
  clips: Record<string, DataRef<"animation.clip">>;
  fallbackClip?: string | undefined;
  target?: RenderNodePath | undefined;
  phaseMappings?: AnimatorPhaseMapping[] | undefined;
  tags?: string[] | undefined;
};

export type AnimatorControllerBinding = {
  controllerId: string;
  bindingId: string;
  renderObjectId: RenderObjectId;
  generation?: number | undefined;
};

export type AnimatorParameterValue = number | boolean | string;

export type AnimatorGameplayPhase = {
  executionId: string;
  abilityId: string;
  phase: string;
  startedAt: number;
  durationMs?: number | undefined;
  predicted?: boolean | undefined;
  generation?: number | undefined;
};

export type AnimationPlaybackLayerFrame = {
  layerId: string;
  stateId?: string | undefined;
  clipId: string;
  backendClip?: string | undefined;
  asset: AssetRef;
  kind: "state" | "one-shot" | "gameplay-phase";
  timeMs: number;
  normalizedTime: number;
  speed: number;
  loop: boolean;
  weight: number;
  mode: "replace" | "additive";
  target?: RenderNodePath | undefined;
  seek: boolean;
};

export type AnimatorMarkerEvent = {
  id: string;
  controllerId: string;
  layerId: string;
  clipId: string;
  markerId: string;
  timestamp: number;
  generation: number;
  executionId?: string | undefined;
  tags?: string[] | undefined;
};

export type AnimationPlaybackFrame = {
  controllerId: string;
  renderObjectId: RenderObjectId;
  generation: number;
  timestamp: number;
  layers: AnimationPlaybackLayerFrame[];
  markers: AnimatorMarkerEvent[];
  reasons: string[];
};

export type AnimationPlaybackAdapterSnapshot = {
  id: string;
  boundControllers: number;
  retainedFrames: number;
  appliedFrames: number;
  disposed?: boolean | undefined;
  details?: Record<string, unknown> | undefined;
};

export type AnimationPlaybackAdapter = {
  id: string;
  bind(
    controllerId: string,
    binding: AnimatorBindingDefinition,
    renderObjectId: RenderObjectId
  ): void;
  apply(controllerId: string, frame: AnimationPlaybackFrame): void;
  applyBatch?(frames: AnimationPlaybackFrame[]): void;
  reset?(controllerId: string, generation: number): void;
  unbind(controllerId: string): void;
  snapshot(): AnimationPlaybackAdapterSnapshot;
  dispose?(): void;
};

export type AnimatorLayerSnapshot = {
  layerId: string;
  stateId: string;
  stateEnteredAt: number;
  activeOneShotId?: string | undefined;
  queuedOneShots: number;
  phaseExecutionId?: string | undefined;
};

export type AnimatorControllerSnapshot = {
  binding: AnimatorControllerBinding;
  generation: number;
  parameters: Record<string, AnimatorParameterValue>;
  layers: AnimatorLayerSnapshot[];
  dirty: boolean;
  emittedMarkers: number;
};

export type AnimatorRuntimeSnapshot = {
  id: string;
  elapsed: number;
  disposed: boolean;
  controllers: AnimatorControllerSnapshot[];
  dirtyControllers: number;
  activeOneShots: number;
  activeGameplayPhases: number;
  queuedOneShots: number;
  emittedMarkers: number;
  appliedFrames: number;
  traceEntries: number;
  adapter: AnimationPlaybackAdapterSnapshot;
};

export type AnimatorTraceKind =
  | "lifecycle"
  | "parameter"
  | "transition"
  | "one-shot"
  | "phase"
  | "marker"
  | "playback"
  | "diagnostic";

export type AnimatorTraceEntry = {
  sequence: number;
  kind: AnimatorTraceKind;
  label: string;
  timestamp: number;
  controllerId?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type AnimatorRuntime = {
  bind(binding: AnimatorControllerBinding): void;
  unbind(controllerId: string): void;
  hasController(controllerId: string): boolean;
  setParameter(controllerId: string, parameterId: string, value: AnimatorParameterValue): void;
  setParameters(controllerId: string, values: Record<string, AnimatorParameterValue>): void;
  trigger(controllerId: string, oneShotId: string): void;
  syncGameplayPhase(controllerId: string, phase: AnimatorGameplayPhase): void;
  cancelGameplayPhase(controllerId: string, executionId: string): void;
  reset(controllerId: string, generation?: number | undefined): void;
  getController(controllerId: string): AnimatorControllerSnapshot | undefined;
  listControllers(): AnimatorControllerSnapshot[];
  update(deltaMs: number, elapsedMs: number): void;
  snapshot(): AnimatorRuntimeSnapshot;
  traces(): AnimatorTraceEntry[];
  dispose(): void;
};

export type AnimatorHandle = Omit<AnimatorRuntime, "update" | "dispose"> & {
  isBound(): boolean;
};

export type CreateAnimatorRuntimeOptions = {
  id?: string | undefined;
  dataRegistry: DataRegistry;
  adapter: AnimationPlaybackAdapter;
  eventBus?: EventBus | undefined;
  maxControllers?: number | undefined;
  maxQueuedOneShotsPerController?: number | undefined;
  markerHistoryLimit?: number | undefined;
  traceLimit?: number | undefined;
  onMarker?: ((marker: AnimatorMarkerEvent) => void) | undefined;
  onMarkerError?: ((error: unknown, marker: AnimatorMarkerEvent) => void) | undefined;
  onTrace?: ((entry: AnimatorTraceEntry) => void) | undefined;
  onTraceError?: ((error: unknown, entry: AnimatorTraceEntry) => void) | undefined;
};

export type CreateAnimatorModuleOptions = CreateAnimatorRuntimeOptions & {
  handle?: AnimatorHandle | undefined;
  onRuntime?: ((runtime: AnimatorRuntime, context: GameInstallContext) => void) | undefined;
};
