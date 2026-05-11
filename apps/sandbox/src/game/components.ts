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
