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
      type: data?.type ?? "debug.square",
      width: data?.width ?? 20,
      height: data?.height ?? 20,
      depth: data?.depth ?? 0,
      props: data?.props ?? {}
    };

    if (data?.renderObjectId) {
      presentation.renderObjectId = data.renderObjectId;
    }

    return presentation;
  }
});

export type SandboxRenderObjectPresentation = {
  renderObjectId?: string;
  type: string;
  width: number;
  height: number;
  depth: number;
  props: Record<string, unknown>;
};
