import type { RenderCommand } from "./command";
import type { RendererDiagnosticListener } from "./diagnostics";
import type { RenderNodePath, RenderObjectId, RenderObjectType } from "./ids";
import type {
  RenderNodePatch,
  RenderObjectDefinition,
  RenderObjectHandle,
  RenderObjectPatch
} from "./object";

export type RendererCapabilities = {
  objectTypes: RenderObjectType[];
  supportsObjectTree: boolean;
  supportsNodeUpdates?: boolean;
  commandTypes?: string[];
  supportsNativeHandles?: boolean;
};

export type RendererBootContext = {
  container: HTMLElement;
  width: number;
  height: number;
  onDiagnostic?: RendererDiagnosticListener;
  debug?: boolean;
};

export type RendererAdapter = {
  id: string;
  boot(ctx: RendererBootContext): Promise<void>;
  destroy(): void;
  getView(): HTMLElement | HTMLCanvasElement;
  capabilities(): RendererCapabilities;
  resize(width: number, height: number): void;
  createObject(definition: RenderObjectDefinition): RenderObjectId;
  updateObject(id: RenderObjectId, patch: RenderObjectPatch): void;
  destroyObject(id: RenderObjectId): void;
  updateNode?(objectId: RenderObjectId, nodePath: RenderNodePath, patch: RenderNodePatch): void;
  command?(objectId: RenderObjectId, command: RenderCommand): void;
  getObjectHandle?(objectId: RenderObjectId): RenderObjectHandle<unknown, unknown>;
};
