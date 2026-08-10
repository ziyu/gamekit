import type { NavigationPoint } from "@gamekit/navigation-core";

export type AiPerceptionFact = {
  key: string;
  subjectId?: string | undefined;
  position?: NavigationPoint | undefined;
  value?: number | string | boolean | undefined;
  observedAt: number;
  expiresAt?: number | undefined;
  confidence?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
};
