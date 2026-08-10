import type { AnimationPlaybackAdapterSnapshot } from "../playback/animation-playback-adapter";
import type {
  AnimatorControllerBinding,
  AnimatorParameterValue
} from "../contracts/controller-binding";

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
