import { createGasError } from "./errors";
import type { GasEffectDefinition } from "./types";

export function assertGasEffectPeriod(effect: GasEffectDefinition): void {
  if (
    effect.periodMs !== undefined &&
    (!Number.isFinite(effect.periodMs) || effect.periodMs <= 0)
  ) {
    throw createGasError(
      "gas.invalid_effect_period",
      "GAS effect period must be positive and finite",
      { effectId: effect.id }
    );
  }
}
