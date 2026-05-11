import type { RenderObjectDefinition } from "@gamekit/renderer-core";
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

    return presentation;
  }
});

export type SandboxRenderObjectPresentation = {
  renderObjectId?: string;
  definition: RenderObjectDefinition;
};
