export type AiSensorDefinition = {
  id: string;
  sampler: string;
  intervalMs: number;
  args?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
};
