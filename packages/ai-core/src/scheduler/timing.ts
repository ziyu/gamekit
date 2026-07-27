export function effectiveAiInterval(base: number, multiplier: number | undefined): number {
  return Math.max(1, base * (multiplier ?? 1));
}

export function stableAiScheduleOffset(key: string, interval: number): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, Math.floor(interval));
}
