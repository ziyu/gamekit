import type {
  RenderNodePatch,
  RenderObjectDefinition,
  RenderObjectPatch
} from "@gamekit/renderer-core";

export function applyObjectPatch(
  object: any,
  patch: RenderObjectDefinition | RenderObjectPatch | RenderNodePatch
): void {
  const transform = patch.transform;
  if (transform?.position) {
    object.setPosition?.(
      transform.position.x ?? object.x,
      transform.position.y ?? object.y,
      transform.position.z ?? object.z
    );
  }
  if (transform?.scale) {
    object.setScale?.(transform.scale.x ?? object.scaleX, transform.scale.y ?? object.scaleY);
  }
  if (transform?.rotation) {
    object.setRotation?.(transform.rotation.z ?? transform.rotation.y ?? transform.rotation.x ?? 0);
  }
  if (typeof patch.props?.width === "number" || typeof patch.props?.height === "number") {
    object.setDisplaySize?.(
      typeof patch.props?.width === "number" ? patch.props.width : object.displayWidth,
      typeof patch.props?.height === "number" ? patch.props.height : object.displayHeight
    );
  }
  if (patch.alpha !== undefined) {
    object.setAlpha?.(patch.alpha);
  }
  if (patch.visible !== undefined) {
    object.setVisible?.(patch.visible);
  }
  if (typeof patch.props?.depth === "number") {
    object.setDepth?.(patch.props.depth);
  }
  if (typeof patch.props?.tint === "number") {
    object.setTint?.(patch.props.tint);
  }
}
