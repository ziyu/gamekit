import type { GameError } from "./game-error";

export type Result<T, E = GameError> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: E;
    };
