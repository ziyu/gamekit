import type { RenderObjectId } from "@gamekit/renderer-core";

export * from "./preview-presentation-module";

export type OutpostPresentationBinding = {
  gameplayObjectId: string;
  renderObjectId: RenderObjectId;
};
