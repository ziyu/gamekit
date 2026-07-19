export type AnimatorErrorCode =
  | "animator.controller_bound"
  | "animator.controller_missing"
  | "animator.definition_missing"
  | "animator.handle_bound"
  | "animator.handle_invalid"
  | "animator.handle_owner_mismatch"
  | "animator.handle_unbound"
  | "animator.invalid_config"
  | "animator.limit_exceeded";

export class AnimatorError extends Error {
  readonly code: AnimatorErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: AnimatorErrorCode,
    message: string,
    details?: Record<string, unknown> | undefined
  ) {
    super(message);
    this.name = "AnimatorError";
    this.code = code;
    this.details = details;
  }
}

export function createAnimatorError(
  code: AnimatorErrorCode,
  message: string,
  details?: Record<string, unknown> | undefined
): AnimatorError {
  return new AnimatorError(code, message, details);
}
