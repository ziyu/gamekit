import { GameError } from "@gamekit/core";

export function createGasError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): GameError {
  return new GameError(code, message, details);
}
