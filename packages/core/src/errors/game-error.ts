export class GameError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.details = details;
  }
}
