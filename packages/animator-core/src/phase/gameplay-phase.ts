export type AnimatorGameplayPhase = {
  executionId: string;
  abilityId: string;
  phase: string;
  startedAt: number;
  durationMs?: number | undefined;
  predicted?: boolean | undefined;
  generation?: number | undefined;
};
