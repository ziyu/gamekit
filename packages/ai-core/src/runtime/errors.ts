export type AiErrorCode =
  | "ai.agent_bound"
  | "ai.agent_missing"
  | "ai.definition_missing"
  | "ai.duplicate_registry_entry"
  | "ai.handle_bound"
  | "ai.handle_invalid"
  | "ai.handle_owner_mismatch"
  | "ai.handle_unbound"
  | "ai.invalid_config";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: AiErrorCode, message: string, details?: Record<string, unknown> | undefined) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.details = details;
  }
}

export function createAiError(
  code: AiErrorCode,
  message: string,
  details?: Record<string, unknown> | undefined
): AiError {
  return new AiError(code, message, details);
}
