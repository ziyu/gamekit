import type { RenderCommand } from "./command";
import type { RendererDiagnosticListener } from "./diagnostics";
import type { RenderNodePath, RenderObjectId } from "./ids";
import type { RenderObjectDefinition, RenderObjectHandle } from "./object";

export type RendererBootContext = {
  container: HTMLElement;
  width: number;
  height: number;
  onDiagnostic?: RendererDiagnosticListener;
  debug?: boolean;
};

export type RendererAdapter<TNative = unknown, TObjectNative = unknown> = {
  id: string;
  kind?: string;
  boot(ctx: RendererBootContext): Promise<void>;
  destroy(): void;
  getView(): HTMLElement | HTMLCanvasElement;
  resize(width: number, height: number): void;
  createObject(definition: RenderObjectDefinition): RenderObjectId;
  destroyObject(id: RenderObjectId): void;
  native(): TNative;
  command?(objectId: RenderObjectId, command: RenderCommand): void;
  getObjectHandle?(objectId: RenderObjectId): RenderObjectHandle<TObjectNative, unknown>;
  getNodeHandle?(
    objectId: RenderObjectId,
    nodePath: RenderNodePath
  ): RenderObjectHandle<TObjectNative, unknown>;
};
