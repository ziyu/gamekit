import type { RenderObjectId, RenderObjectType } from "./ids";
import type { RenderTransform } from "./transform";

export type RenderObjectProps = Record<string, unknown>;

export type RenderAnimationDefinition<TProps extends RenderObjectProps = RenderObjectProps> = {
  id: string;
  type?: string;
  autoplay?: boolean;
  loop?: boolean;
  props?: TProps;
};

export type RenderNodeDefinition<TProps extends RenderObjectProps = RenderObjectProps> = {
  id?: string;
  type: RenderObjectType;
  transform?: RenderTransform;
  visible?: boolean;
  alpha?: number;
  layer?: string;
  props?: TProps;
  children?: Array<RenderNodeDefinition>;
  animations?: Array<RenderAnimationDefinition>;
  tags?: string[];
};

export type RenderObjectDefinition<TProps extends RenderObjectProps = RenderObjectProps> = {
  id?: RenderObjectId;
  type: RenderObjectType;
  transform?: RenderTransform;
  visible?: boolean;
  alpha?: number;
  layer?: string;
  props?: TProps;
  children?: RenderNodeDefinition[];
  animations?: Array<RenderAnimationDefinition>;
  tags?: string[];
};

export type RenderObjectPatch<TProps extends RenderObjectProps = RenderObjectProps> = {
  transform?: RenderTransform;
  visible?: boolean;
  alpha?: number;
  layer?: string;
  props?: Partial<TProps>;
};

export type RenderNodePatch<TProps extends RenderObjectProps = RenderObjectProps> =
  RenderObjectPatch<TProps>;

export type RenderObjectHandle<TNative = unknown, TApi = unknown> = {
  id: RenderObjectId;
  type: RenderObjectType;
  native: TNative;
  api?: TApi;
  escaped?: boolean;
};
