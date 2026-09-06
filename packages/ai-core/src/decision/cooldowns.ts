export function pruneAiGoalCooldowns(cooldowns: Map<string, number>, elapsed: number): void {
  for (const [goalId, cooldownUntil] of cooldowns) {
    if (cooldownUntil <= elapsed) {
      cooldowns.delete(goalId);
    }
  }
}
