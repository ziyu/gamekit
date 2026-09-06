import type { AnimatorBindingDefinition } from "./binding-definition";
import type { AnimationClipDefinition } from "./clip-definition";
import type {
  AnimatorGraphDefinition,
  AnimatorLayerDefinition,
  AnimatorTransitionDefinition
} from "./graph-definition";

export function cloneAnimationClipDefinition(
  clip: AnimationClipDefinition
): AnimationClipDefinition {
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

export function cloneAnimatorBindingDefinition(
  binding: AnimatorBindingDefinition
): AnimatorBindingDefinition {
  return {
    ...binding,
    graph: { ...binding.graph },
    clips: Object.fromEntries(
      Object.entries(binding.clips).map(([alias, reference]) => [alias, { ...reference }])
    ),
    ...(binding.target === undefined ? {} : { target: cloneRenderTarget(binding.target) }),
    ...(binding.phaseMappings === undefined
      ? {}
      : { phaseMappings: binding.phaseMappings.map((mapping) => ({ ...mapping })) }),
    ...(binding.tags === undefined ? {} : { tags: [...binding.tags] })
  };
}

export function cloneAnimatorGraphDefinition(
  graph: AnimatorGraphDefinition
): AnimatorGraphDefinition {
  return {
    ...graph,
    parameters: graph.parameters.map((parameter) => ({ ...parameter })),
    layers: graph.layers.map(cloneAnimatorLayerDefinition),
    ...(graph.oneShots === undefined
      ? {}
      : { oneShots: graph.oneShots.map((oneShot) => ({ ...oneShot })) }),
    ...(graph.tags === undefined ? {} : { tags: [...graph.tags] })
  };
}

export function cloneRenderTarget<T extends string | string[]>(target: T): T {
  return (Array.isArray(target) ? [...target] : target) as T;
}

function cloneAnimatorLayerDefinition(layer: AnimatorLayerDefinition): AnimatorLayerDefinition {
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
    ...(layer.target === undefined ? {} : { target: cloneRenderTarget(layer.target) })
  };
}
