export function resolveArenaQualificationCount(
  configuredCount: number,
  entrantCount: number
): number {
  if (
    !Number.isSafeInteger(configuredCount) ||
    configuredCount <= 0 ||
    !Number.isSafeInteger(entrantCount) ||
    entrantCount < 0
  ) {
    throw new Error("Invalid Arena qualification count input");
  }
  return Math.min(configuredCount, entrantCount);
}
