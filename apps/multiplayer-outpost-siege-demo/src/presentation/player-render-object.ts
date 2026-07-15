import type { DataRegistry } from "@gamekit/data";
import type { RenderObjectDefinition } from "@gamekit/renderer-core";

import { OUTPOST_RENDER_OBJECT_TYPE, type OutpostRenderObjectDefinition } from "../domain";
import { OUTPOST_PRESENTATION_SIZE } from "../gameplay/constants";

export function createOutpostPlayerRenderObjectDefinition(
  registry: DataRegistry,
  renderKey: string,
  id: string,
  x: number,
  y: number,
  rotation: number
): RenderObjectDefinition {
  const source = registry.getValue<OutpostRenderObjectDefinition>(
    OUTPOST_RENDER_OBJECT_TYPE,
    renderKey
  );
  const size = OUTPOST_PRESENTATION_SIZE[renderKey as keyof typeof OUTPOST_PRESENTATION_SIZE];
  if (!size) {
    throw new Error(`Outpost player render object requires presentation size: ${renderKey}`);
  }
  const texture = source.assetRefs.texture;
  if (!texture) {
    throw new Error(`Outpost player render object requires texture AssetRef: ${renderKey}`);
  }
  return {
    id,
    type: source.type,
    ...(source.layer === undefined ? {} : { layer: source.layer }),
    tags: [...(source.tags ?? []), "outpost.client-player"],
    transform: { position: { x, y }, rotation: { z: rotation } },
    props: { textureId: texture.assetId, ...size }
  };
}
