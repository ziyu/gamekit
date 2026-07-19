export type NavigationErrorCode =
  | "navigation.handle_bound"
  | "navigation.handle_invalid"
  | "navigation.handle_owner_mismatch"
  | "navigation.handle_unbound"
  | "navigation.invalid_config";

export class NavigationError extends Error {
  readonly code: NavigationErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: NavigationErrorCode,
    message: string,
    details?: Record<string, unknown> | undefined
  ) {
    super(message);
    this.name = "NavigationError";
    this.code = code;
    this.details = details;
  }
}

export function createNavigationError(
  code: NavigationErrorCode,
  message: string,
  details?: Record<string, unknown> | undefined
): NavigationError {
  return new NavigationError(code, message, details);
}
