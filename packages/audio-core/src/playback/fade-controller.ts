export type PlaybackFadeController = {
  scheduleStop(instanceId: string, completesAt: number): void;
  cancel(instanceId: string): void;
  due(now: number): string[];
  clear(): void;
};

export function createPlaybackFadeController(): PlaybackFadeController {
  const stops = new Map<string, number>();
  return {
    scheduleStop(instanceId, completesAt) {
      stops.set(instanceId, completesAt);
    },
    cancel(instanceId) {
      stops.delete(instanceId);
    },
    due(now) {
      const result: string[] = [];
      for (const [instanceId, completesAt] of stops) {
        if (now >= completesAt) {
          stops.delete(instanceId);
          result.push(instanceId);
        }
      }
      return result.sort();
    },
    clear() {
      stops.clear();
    }
  };
}
