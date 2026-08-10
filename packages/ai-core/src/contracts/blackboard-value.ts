export type AiBlackboardPrimitive = string | number | boolean | null;

export type AiBlackboardValue =
  | AiBlackboardPrimitive
  | AiBlackboardValue[]
  | { [key: string]: AiBlackboardValue };
