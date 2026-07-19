import type {
  AnimationPlaybackAdapter,
  AnimationPlaybackFrame,
  AnimatorBindingDefinition
} from "./types";

export type MemoryAnimationPlaybackAdapter = AnimationPlaybackAdapter & {
  frame(controllerId: string): AnimationPlaybackFrame | undefined;
  frames(): AnimationPlaybackFrame[];
  clear(): void;
};

export type CreateMemoryAnimationPlaybackAdapterOptions = {
  id?: string | undefined;
  maxRetainedFrames?: number | undefined;
};

export function createMemoryAnimationPlaybackAdapter(
  options: CreateMemoryAnimationPlaybackAdapterOptions = {}
): MemoryAnimationPlaybackAdapter {
  const id = options.id ?? "animator.memory";
  const maxRetainedFrames = positiveInteger(options.maxRetainedFrames, 1_024);
  const bindings = new Map<string, AnimatorBindingDefinition>();
  const latest = new Map<string, AnimationPlaybackFrame>();
  const retained: AnimationPlaybackFrame[] = [];
  let appliedFrames = 0;
  let appliedBatches = 0;
  let disposed = false;

  const adapter: MemoryAnimationPlaybackAdapter = {
    id,
    bind(controllerId, binding) {
      bindings.set(controllerId, cloneBinding(binding));
    },
    apply(controllerId, frame) {
      retain(controllerId, frame);
    },
    applyBatch(frames) {
      appliedBatches += 1;
      for (const frame of frames) {
        retain(frame.controllerId, frame);
      }
    },
    reset(controllerId) {
      latest.delete(controllerId);
    },
    unbind(controllerId) {
      bindings.delete(controllerId);
      latest.delete(controllerId);
      for (let index = retained.length - 1; index >= 0; index -= 1) {
        if (retained[index]?.controllerId === controllerId) {
          retained.splice(index, 1);
        }
      }
    },
    frame(controllerId) {
      const frame = latest.get(controllerId);
      return frame === undefined ? undefined : cloneFrame(frame);
    },
    frames() {
      return retained.map(cloneFrame);
    },
    clear() {
      retained.length = 0;
      latest.clear();
    },
    snapshot() {
      return {
        id,
        boundControllers: bindings.size,
        retainedFrames: retained.length,
        appliedFrames,
        disposed,
        details: { appliedBatches }
      };
    },
    dispose() {
      bindings.clear();
      latest.clear();
      retained.length = 0;
      disposed = true;
    }
  };
  return adapter;

  function retain(controllerId: string, input: AnimationPlaybackFrame): void {
    const frame = cloneFrame(input);
    latest.set(controllerId, frame);
    retained.push(frame);
    appliedFrames += 1;
    if (retained.length > maxRetainedFrames) {
      retained.splice(0, retained.length - maxRetainedFrames);
    }
  }
}

function cloneFrame(frame: AnimationPlaybackFrame): AnimationPlaybackFrame {
  return {
    ...frame,
    layers: frame.layers.map((layer) => ({
      ...layer,
      asset: { ...layer.asset },
      ...(Array.isArray(layer.target) ? { target: [...layer.target] } : {})
    })),
    markers: frame.markers.map((marker) => ({
      ...marker,
      ...(marker.tags === undefined ? {} : { tags: [...marker.tags] })
    })),
    reasons: [...frame.reasons]
  };
}

function cloneBinding(binding: AnimatorBindingDefinition): AnimatorBindingDefinition {
  return {
    ...binding,
    graph: { ...binding.graph },
    clips: Object.fromEntries(
      Object.entries(binding.clips).map(([alias, reference]) => [alias, { ...reference }])
    ),
    ...(Array.isArray(binding.target) ? { target: [...binding.target] } : {}),
    ...(binding.phaseMappings === undefined
      ? {}
      : { phaseMappings: binding.phaseMappings.map((mapping) => ({ ...mapping })) }),
    ...(binding.tags === undefined ? {} : { tags: [...binding.tags] })
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error("Memory animation adapter maxRetainedFrames must be a positive integer");
  }
  return resolved;
}
