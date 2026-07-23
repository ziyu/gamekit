import { createAnimationClipDataType } from "./animation-clip-data-type";
import { createAnimatorBindingDataType } from "./animator-binding-data-type";
import { createAnimatorGraphDataType } from "./animator-graph-data-type";
import type { AnimatorDataTypeDefinition } from "./data-type-contract";

export {
  ANIMATION_CLIP_TYPE,
  ANIMATOR_BINDING_TYPE,
  ANIMATOR_GRAPH_TYPE
} from "./data-type-contract";
export type { AnimatorDataTypeDefinition } from "./data-type-contract";
export { createAnimationClipDataType } from "./animation-clip-data-type";
export { createAnimatorBindingDataType } from "./animator-binding-data-type";
export { createAnimatorGraphDataType } from "./animator-graph-data-type";

export function createAnimatorDataTypes(): AnimatorDataTypeDefinition[] {
  return [
    createAnimationClipDataType(),
    createAnimatorGraphDataType(),
    createAnimatorBindingDataType()
  ];
}
