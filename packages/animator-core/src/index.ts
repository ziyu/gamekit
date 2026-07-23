export { AnimatorError, createAnimatorError } from "./contracts/errors";
export type { AnimatorErrorCode } from "./contracts/errors";
export type { AnimatorHandle, AnimatorRuntime } from "./controller/animator-controller";
export type {
  AnimatorControllerBinding,
  AnimatorParameterValue
} from "./contracts/controller-binding";
export {
  bindAnimatorHandle,
  createAnimatorHandle,
  unbindAnimatorHandle
} from "./controller/create-animator-handle";
export type { AnimatorHandleOptions } from "./controller/create-animator-handle";
export { createAnimatorModule } from "./composition/create-animator-module";
export { createAnimatorRuntime } from "./composition/create-animator-runtime";
export type {
  CreateAnimatorModuleOptions,
  CreateAnimatorRuntimeOptions
} from "./composition/options";
export {
  ANIMATION_CLIP_TYPE,
  ANIMATOR_BINDING_TYPE,
  ANIMATOR_GRAPH_TYPE,
  createAnimationClipDataType,
  createAnimatorBindingDataType,
  createAnimatorDataTypes,
  createAnimatorGraphDataType
} from "./graph/animator-data-types";
export type { AnimatorDataTypeDefinition } from "./graph/animator-data-types";
export type { AnimatorBindingDefinition, AnimatorPhaseMapping } from "./graph/binding-definition";
export type {
  AnimationClipDefinition,
  AnimationClipMarkerDefinition
} from "./graph/clip-definition";
export type {
  AnimatorConditionOperator,
  AnimatorGraphDefinition,
  AnimatorLayerDefinition,
  AnimatorOneShotDefinition,
  AnimatorOneShotInterruptPolicy,
  AnimatorOneShotRepeatPolicy,
  AnimatorParameterDefinition,
  AnimatorParameterType,
  AnimatorStateDefinition,
  AnimatorTransitionCondition,
  AnimatorTransitionDefinition
} from "./graph/graph-definition";
export type { AnimatorMarkerEvent } from "./marker/marker-event";
export type {
  AnimatorControllerSnapshot,
  AnimatorLayerSnapshot,
  AnimatorRuntimeSnapshot
} from "./observability/animator-snapshot";
export type { AnimatorTraceEntry, AnimatorTraceKind } from "./observability/animator-trace";
export type { AnimatorGameplayPhase } from "./phase/gameplay-phase";
