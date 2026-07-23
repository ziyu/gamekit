import type {
  AnimatorControllerBinding,
  AnimatorParameterValue
} from "../contracts/controller-binding";
import type { AnimatorGameplayPhase } from "../phase/gameplay-phase";
import type {
  AnimatorControllerSnapshot,
  AnimatorRuntimeSnapshot
} from "../observability/animator-snapshot";
import type { AnimatorTraceEntry } from "../observability/animator-trace";

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
