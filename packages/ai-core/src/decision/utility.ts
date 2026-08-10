import type { AiAgentReadContext } from "../contracts/agent-context";

export type AiUtilityCurve =
  | { type: "linear"; min?: number | undefined; max?: number | undefined }
  | { type: "inverse"; min?: number | undefined; max?: number | undefined }
  | { type: "step"; threshold: number; below?: number | undefined; above?: number | undefined }
  | { type: "power"; exponent: number; min?: number | undefined; max?: number | undefined }
  | { type: "points"; points: Array<{ x: number; y: number }> };

export type AiConsiderationDefinition = {
  input: string;
  curve: AiUtilityCurve;
  weight?: number | undefined;
};

export type AiUtilityInputResolver = {
  id: string;
  read(context: AiAgentReadContext, consideration: AiConsiderationDefinition): number;
};

export type AiGoalScore = {
  goalId: string;
  score: number;
  eligible: boolean;
  considerations: Array<{
    input: string;
    raw: number;
    curved: number;
    weight: number;
  }>;
};
