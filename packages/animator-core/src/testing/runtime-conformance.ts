import type { AnimatorRuntime } from "../controller/animator-controller";
import type { AnimatorControllerBinding } from "../contracts/controller-binding";
import type { AnimationPlaybackAdapter } from "../playback/animation-playback-adapter";

export type AnimatorConformanceHarness = {
  runtime: AnimatorRuntime;
  adapter: AnimationPlaybackAdapter;
  binding: AnimatorControllerBinding;
  transitionParameter: string;
  oneShotId: string;
  dispose(): void;
};

export type AnimatorConformanceReport = {
  checks: string[];
  appliedFrames: number;
  generation: number;
};

export function runAnimatorRuntimeConformance(
  createHarness: () => AnimatorConformanceHarness
): AnimatorConformanceReport {
  const harness = createHarness();
  try {
    harness.runtime.bind(harness.binding);
    harness.runtime.update(16, 16);
    assertConformance(
      harness.adapter.snapshot().boundControllers === 1,
      "adapter receives controller binding"
    );

    harness.runtime.setParameter(harness.binding.controllerId, harness.transitionParameter, true);
    harness.runtime.update(16, 32);
    assertConformance(
      harness.runtime.getController(harness.binding.controllerId)?.layers[0]?.stateId !== undefined,
      "parameter updates produce a stable layer state"
    );

    harness.runtime.trigger(harness.binding.controllerId, harness.oneShotId);
    harness.runtime.update(16, 48);
    assertConformance(
      harness.runtime.snapshot().activeOneShots === 1,
      "one-shot enters active playback"
    );

    harness.runtime.reset(harness.binding.controllerId);
    const generation =
      harness.runtime.getController(harness.binding.controllerId)?.generation ?? -1;
    assertConformance(generation === 1, "reset advances controller generation");

    harness.runtime.unbind(harness.binding.controllerId);
    assertConformance(
      harness.adapter.snapshot().boundControllers === 0,
      "unbind releases adapter state"
    );
    return {
      checks: [
        "adapter receives controller binding",
        "parameter updates produce a stable layer state",
        "one-shot enters active playback",
        "reset advances controller generation",
        "unbind releases adapter state"
      ],
      appliedFrames: harness.adapter.snapshot().appliedFrames,
      generation
    };
  } finally {
    harness.dispose();
  }
}

function assertConformance(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Animator conformance failed: ${message}`);
  }
}
