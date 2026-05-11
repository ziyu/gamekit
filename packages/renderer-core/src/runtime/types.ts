import type { EventBus } from "@gamekit/event-bus";

export type RenderObjectId = string;
export type RenderObjectType = string;

export type RenderObjectProps = Record<string, unknown>;

export type RenderTransform = {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
};

export type RenderObjectConfig<TProps extends RenderObjectProps = RenderObjectProps> = {
  id?: RenderObjectId;
  type: RenderObjectType;
  transform?: RenderTransform;
  visible?: boolean;
  alpha?: number;
  depth?: number;
  layer?: string;
  parentId?: RenderObjectId;
  children?: Array<RenderObjectConfig>;
  props?: TProps;
};

export type RenderObjectPatch<TProps extends RenderObjectProps = RenderObjectProps> = {
  transform?: RenderTransform;
  visible?: boolean;
  alpha?: number;
  depth?: number;
  layer?: string;
  props?: Partial<TProps>;
};

export type RendererCapabilities = {
  objectTypes: RenderObjectType[];
  supportsObjectTree: boolean;
};

export type RendererBootContext = {
  container: HTMLElement;
  width: number;
  height: number;
  eventBus?: Pick<EventBus, "emit">;
  debug?: boolean;
};

export type RendererAdapter = {
  id: string;
  boot(ctx: RendererBootContext): Promise<void>;
  destroy(): void;
  getView(): HTMLElement | HTMLCanvasElement;
  capabilities(): RendererCapabilities;
  resize(width: number, height: number): void;
  createObject(config: RenderObjectConfig): RenderObjectId;
  updateObject(id: RenderObjectId, patch: RenderObjectPatch): void;
  setParent(id: RenderObjectId, parentId?: RenderObjectId): void;
  destroyObject(id: RenderObjectId): void;
  playAnimation(id: RenderObjectId, animationId: string): void;
};
