import type { RenderObjectId } from "@gamekit/renderer-core";

export * from "./client-presentation-module";
export * from "./player-render-object";
export * from "./preview-presentation-module";

export type OutpostPresentationBinding = {
  gameplayObjectId: string;
  renderObjectId: RenderObjectId;
};
