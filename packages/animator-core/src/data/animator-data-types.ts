import { DEFAULT_ASSET_DATA_TYPE } from "@gamekit/asset";
import type {
  DataDiagnostic,
  DataDocument,
  DataReferenceTarget,
  DataTypeDefinition
} from "@gamekit/data";
import type {
  AnimationClipDefinition,
  AnimatorBindingDefinition,
  AnimatorGraphDefinition,
  AnimatorParameterDefinition
} from "../runtime/types";

export const ANIMATION_CLIP_TYPE = "animation.clip";
export const ANIMATOR_GRAPH_TYPE = "animator.graph";
export const ANIMATOR_BINDING_TYPE = "animator.binding";

export type AnimatorDataTypeDefinition =
  | DataTypeDefinition<AnimationClipDefinition>
  | DataTypeDefinition<AnimatorGraphDefinition>
  | DataTypeDefinition<AnimatorBindingDefinition>;

export function createAnimatorDataTypes(): AnimatorDataTypeDefinition[] {
  return [
    createAnimationClipDataType(),
    createAnimatorGraphDataType(),
    createAnimatorBindingDataType()
  ];
}

export function createAnimationClipDataType(): DataTypeDefinition<AnimationClipDefinition> {
  return {
    type: ANIMATION_CLIP_TYPE,
    getTags: (clip) => clip.tags ?? [],
    validate(document) {
      const diagnostics = validateId(document, "animator.clip_missing_id");
      if (!positiveFinite(document.data.durationMs)) {
        diagnostics.push(
          diagnostic(
            "animator.clip_invalid_duration",
            "Animation clip durationMs must be positive and finite",
            document,
            "durationMs"
          )
        );
      }
      if (!nonEmptyString(document.data.asset?.assetId)) {
        diagnostics.push(
          diagnostic(
            "animator.clip_missing_asset",
            "Animation clip requires an asset reference",
            document,
            "asset.assetId"
          )
        );
      }
      const markerIds = new Set<string>();
      let previousTime = -1;
      for (const [index, marker] of (document.data.markers ?? []).entries()) {
        if (!nonEmptyString(marker.id) || markerIds.has(marker.id)) {
          diagnostics.push(
            diagnostic(
              markerIds.has(marker.id)
                ? "animator.clip_duplicate_marker"
                : "animator.clip_marker_missing_id",
              "Animation clip markers require unique ids",
              document,
              `markers[${index}].id`
            )
          );
        }
        if (
          !nonNegativeFinite(marker.timeMs) ||
          marker.timeMs > document.data.durationMs ||
          marker.timeMs < previousTime
        ) {
          diagnostics.push(
            diagnostic(
              "animator.clip_invalid_marker_time",
              "Animation clip markers must be sorted within the clip duration",
              document,
              `markers[${index}].timeMs`
            )
          );
        }
        markerIds.add(marker.id);
        previousTime = marker.timeMs;
      }
      return diagnostics;
    },
    references(document) {
      return nonEmptyString(document.data.asset?.assetId)
        ? [
            {
              type: DEFAULT_ASSET_DATA_TYPE,
              id: document.data.asset.assetId,
              path: "asset.assetId"
            }
          ]
        : [];
    }
  };
}

export function createAnimatorGraphDataType(): DataTypeDefinition<AnimatorGraphDefinition> {
  return {
    type: ANIMATOR_GRAPH_TYPE,
    getTags: (graph) => graph.tags ?? [],
    validate(document) {
      const diagnostics = validateId(document, "animator.graph_missing_id");
      const parameters = new Map<string, AnimatorParameterDefinition>();
      for (const [index, parameter] of document.data.parameters.entries()) {
        if (!nonEmptyString(parameter.id) || parameters.has(parameter.id)) {
          diagnostics.push(
            diagnostic(
              parameters.has(parameter.id)
                ? "animator.graph_duplicate_parameter"
                : "animator.graph_parameter_missing_id",
              "Animator parameters require unique ids",
              document,
              `parameters[${index}].id`
            )
          );
        }
        if (!parameterDefaultMatches(parameter)) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_parameter_default",
              "Animator parameter default does not match its type",
              document,
              `parameters[${index}].default`
            )
          );
        }
        parameters.set(parameter.id, parameter);
      }

      const layerIds = new Set<string>();
      for (const [layerIndex, layer] of document.data.layers.entries()) {
        if (!nonEmptyString(layer.id) || layerIds.has(layer.id)) {
          diagnostics.push(
            diagnostic(
              layerIds.has(layer.id)
                ? "animator.graph_duplicate_layer"
                : "animator.graph_layer_missing_id",
              "Animator layers require unique ids",
              document,
              `layers[${layerIndex}].id`
            )
          );
        }
        layerIds.add(layer.id);
        if (layer.priority !== undefined && !Number.isFinite(layer.priority)) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_layer_priority",
              "Animator layer priority must be finite",
              document,
              `layers[${layerIndex}].priority`
            )
          );
        }
        if (
          layer.weight !== undefined &&
          (!Number.isFinite(layer.weight) || layer.weight < 0 || layer.weight > 1)
        ) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_layer_weight",
              "Animator layer weight must be between zero and one",
              document,
              `layers[${layerIndex}].weight`
            )
          );
        }
        const stateIds = new Set<string>();
        for (const [stateIndex, state] of layer.states.entries()) {
          if (!nonEmptyString(state.id) || !nonEmptyString(state.clip) || stateIds.has(state.id)) {
            diagnostics.push(
              diagnostic(
                "animator.graph_invalid_state",
                "Animator states require unique ids and clip aliases",
                document,
                `layers[${layerIndex}].states[${stateIndex}]`
              )
            );
          }
          stateIds.add(state.id);
          if (state.speed !== undefined && !positiveFinite(state.speed)) {
            diagnostics.push(
              diagnostic(
                "animator.graph_invalid_state_speed",
                "Animator state speed must be positive and finite",
                document,
                `layers[${layerIndex}].states[${stateIndex}].speed`
              )
            );
          }
        }
        if (!stateIds.has(layer.initialState)) {
          diagnostics.push(
            diagnostic(
              "animator.graph_missing_initial_state",
              "Animator layer initialState must exist",
              document,
              `layers[${layerIndex}].initialState`
            )
          );
        }
        for (const [transitionIndex, transition] of (layer.transitions ?? []).entries()) {
          if (
            (transition.from !== "*" && !stateIds.has(transition.from)) ||
            !stateIds.has(transition.to)
          ) {
            diagnostics.push(
              diagnostic(
                "animator.graph_invalid_transition_state",
                "Animator transitions must reference states in their layer",
                document,
                `layers[${layerIndex}].transitions[${transitionIndex}]`
              )
            );
          }
          if (transition.priority !== undefined && !Number.isFinite(transition.priority)) {
            diagnostics.push(
              diagnostic(
                "animator.graph_invalid_transition_priority",
                "Animator transition priority must be finite",
                document,
                `layers[${layerIndex}].transitions[${transitionIndex}].priority`
              )
            );
          }
          for (const [conditionIndex, condition] of transition.conditions.entries()) {
            if (!parameters.has(condition.parameter)) {
              diagnostics.push(
                diagnostic(
                  "animator.graph_unknown_condition_parameter",
                  "Animator transition condition references an unknown parameter",
                  document,
                  `layers[${layerIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}].parameter`
                )
              );
            }
          }
        }
      }
      const oneShotIds = new Set<string>();
      for (const [index, oneShot] of (document.data.oneShots ?? []).entries()) {
        if (
          !nonEmptyString(oneShot.id) ||
          !nonEmptyString(oneShot.clip) ||
          !layerIds.has(oneShot.layer) ||
          oneShotIds.has(oneShot.id)
        ) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_one_shot",
              "Animator one-shots require a unique id, clip alias, and existing layer",
              document,
              `oneShots[${index}]`
            )
          );
        }
        if (
          oneShot.maxQueue !== undefined &&
          (!Number.isSafeInteger(oneShot.maxQueue) || oneShot.maxQueue < 0)
        ) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_one_shot_queue",
              "Animator one-shot maxQueue must be a non-negative integer",
              document,
              `oneShots[${index}].maxQueue`
            )
          );
        }
        if (oneShot.speed !== undefined && !positiveFinite(oneShot.speed)) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_one_shot_speed",
              "Animator one-shot speed must be positive and finite",
              document,
              `oneShots[${index}].speed`
            )
          );
        }
        if (oneShot.priority !== undefined && !Number.isFinite(oneShot.priority)) {
          diagnostics.push(
            diagnostic(
              "animator.graph_invalid_one_shot_priority",
              "Animator one-shot priority must be finite",
              document,
              `oneShots[${index}].priority`
            )
          );
        }
        oneShotIds.add(oneShot.id);
      }
      return diagnostics;
    }
  };
}

export function createAnimatorBindingDataType(): DataTypeDefinition<AnimatorBindingDefinition> {
  return {
    type: ANIMATOR_BINDING_TYPE,
    getTags: (binding) => binding.tags ?? [],
    validate(document) {
      const diagnostics = validateId(document, "animator.binding_missing_id");
      if (document.data.graph?.type !== ANIMATOR_GRAPH_TYPE || !document.data.graph.id) {
        diagnostics.push(
          diagnostic(
            "animator.binding_invalid_graph",
            "Animator binding requires an animator.graph reference",
            document,
            "graph"
          )
        );
      }
      if (
        document.data.fallbackClip !== undefined &&
        document.data.clips[document.data.fallbackClip] === undefined
      ) {
        diagnostics.push(
          diagnostic(
            "animator.binding_invalid_fallback",
            "Animator binding fallbackClip must be a declared clip alias",
            document,
            "fallbackClip"
          )
        );
      }
      for (const [alias, reference] of Object.entries(document.data.clips)) {
        if (!nonEmptyString(alias) || reference.type !== ANIMATION_CLIP_TYPE || !reference.id) {
          diagnostics.push(
            diagnostic(
              "animator.binding_invalid_clip",
              "Animator binding clips require aliases and animation.clip references",
              document,
              `clips.${alias}`
            )
          );
        }
      }
      for (const [index, mapping] of (document.data.phaseMappings ?? []).entries()) {
        if (
          !nonEmptyString(mapping.phase) ||
          !nonEmptyString(mapping.layer) ||
          document.data.clips[mapping.clip] === undefined
        ) {
          diagnostics.push(
            diagnostic(
              "animator.binding_invalid_phase_mapping",
              "Animator phase mappings require a phase, layer, and declared clip alias",
              document,
              `phaseMappings[${index}]`
            )
          );
        }
        if (mapping.speed !== undefined && !positiveFinite(mapping.speed)) {
          diagnostics.push(
            diagnostic(
              "animator.binding_invalid_phase_speed",
              "Animator phase mapping speed must be positive and finite",
              document,
              `phaseMappings[${index}].speed`
            )
          );
        }
      }
      return diagnostics;
    },
    references(document) {
      const references: DataReferenceTarget[] = [];
      if (document.data.graph?.id) {
        references.push({ type: ANIMATOR_GRAPH_TYPE, id: document.data.graph.id, path: "graph" });
      }
      for (const [alias, reference] of Object.entries(document.data.clips ?? {})) {
        if (reference.id) {
          references.push({ type: ANIMATION_CLIP_TYPE, id: reference.id, path: `clips.${alias}` });
        }
      }
      return references;
    }
  };
}

function parameterDefaultMatches(parameter: AnimatorParameterDefinition): boolean {
  if (parameter.default === undefined) {
    return true;
  }
  switch (parameter.type) {
    case "number":
      return typeof parameter.default === "number" && Number.isFinite(parameter.default);
    case "boolean":
      return typeof parameter.default === "boolean";
    case "string":
      return typeof parameter.default === "string";
    case "trigger":
      return false;
  }
}

function validateId<T extends { id: string }>(
  document: DataDocument<T>,
  code: string
): DataDiagnostic[] {
  return nonEmptyString(document.data.id)
    ? []
    : [diagnostic(code, "Animator definition requires an id", document, "id")];
}

function diagnostic(
  code: string,
  message: string,
  document: DataDocument,
  path: string
): DataDiagnostic {
  return {
    code,
    message,
    severity: "error",
    key: { type: document.type, id: document.id },
    path,
    ...(document.sourcePackId === undefined ? {} : { sourcePackId: document.sourcePackId })
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
