export type AiTaskInterruptPolicy = "always" | "safe-point" | "never";

export type AiTaskDefinition = {
  id: string;
  executor: string;
  interruptPolicy?: AiTaskInterruptPolicy | undefined;
  timeoutMs?: number | undefined;
  args?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
};
