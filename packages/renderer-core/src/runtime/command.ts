import type { RenderObjectProps } from "./object";

export type RenderCommand<TArgs extends RenderObjectProps = RenderObjectProps> = {
  type: string;
  target?: string | string[];
  args?: TArgs;
};
