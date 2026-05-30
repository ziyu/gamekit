import type {
  RenderNodePatch,
  RenderObjectDefinition,
  RenderObjectPatch
} from "@gamekit/renderer-core";

const PHASER_TINT_MODES = {
  multiply: 0,
  fill: 1,
  add: 2,
  screen: 4,
  overlay: 5,
  hard_light: 6
} as const;

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
  if (transform?.rotation) {
    object.setRotation?.(transform.rotation.z ?? transform.rotation.y ?? transform.rotation.x ?? 0);
  }
  if (typeof patch.props?.width === "number" || typeof patch.props?.height === "number") {
    const width = typeof patch.props?.width === "number" ? patch.props.width : object.displayWidth;
    const height =
      typeof patch.props?.height === "number" ? patch.props.height : object.displayHeight;
    object.setData?.("gamekit.baseDisplayWidth", width);
    object.setData?.("gamekit.baseDisplayHeight", height);
    object.setDisplaySize?.(width, height);
  }
  if (transform?.scale) {
    const scaleX = transform.scale.x ?? 1;
    const scaleY = transform.scale.y ?? scaleX;
    const baseWidth = object.getData?.("gamekit.baseDisplayWidth");
    const baseHeight = object.getData?.("gamekit.baseDisplayHeight");

    if (typeof baseWidth === "number" && typeof baseHeight === "number") {
      object.setDisplaySize?.(baseWidth * scaleX, baseHeight * scaleY);
    } else {
      object.setScale?.(scaleX, scaleY);
    }
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
  const tintMode = resolveTintMode(patch.props?.tintMode);
  if (tintMode !== undefined) {
    object.setTintMode?.(tintMode);
  }
}

function resolveTintMode(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  return PHASER_TINT_MODES[value as keyof typeof PHASER_TINT_MODES];
}
