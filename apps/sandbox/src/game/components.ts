import type { RenderNodePath, RenderObjectDefinition } from "@gamekit/renderer-core";
import { defineComponent } from "@gamekit/world";

export const Position = defineComponent({
  id: "sandbox.position",
  create: (data?: Partial<{ x: number; y: number }>) => ({
    x: data?.x ?? 0,
    y: data?.y ?? 0
  })
});

export const Velocity = defineComponent({
  id: "sandbox.velocity",
  create: (data?: Partial<{ x: number; y: number }>) => ({
    x: data?.x ?? 0,
    y: data?.y ?? 0
  })
});

export const RenderObjectPresentation = defineComponent({
  id: "sandbox.render_object_presentation",
  create: (data?: Partial<SandboxRenderObjectPresentation>): SandboxRenderObjectPresentation => {
    const presentation: SandboxRenderObjectPresentation = {
      definition: data?.definition ?? {
        type: "debug.square",
        props: {
          width: 20,
          height: 20
        }
      }
    };

    if (data?.renderObjectId) {
      presentation.renderObjectId = data.renderObjectId;
    }
    if (data?.nodeAnimations) {
      presentation.nodeAnimations = data.nodeAnimations;
    }

    return presentation;
  }
});

export type SandboxRenderObjectPresentation = {
  renderObjectId?: string;
  definition: RenderObjectDefinition;
  nodeAnimations?: SandboxRenderNodeAnimation[];
};

export type SandboxRenderNodeAnimation =
  | {
      kind: "orbit";
      nodePath: RenderNodePath;
      radius: number;
      speed: number;
      phase?: number;
    }
  | {
      kind: "pulse";
      nodePath: RenderNodePath;
      scale: number;
      speed: number;
      phase?: number;
      alpha?: {
        min: number;
        max: number;
      };
    }
  | {
      kind: "spin";
      nodePath: RenderNodePath;
      speed: number;
      phase?: number;
    };
