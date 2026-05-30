import { describe, expect, it } from "vitest";
import { Loot } from "./game";
import { createAbyssTestHarness } from "./test/abyss-test-utils";

describe("Abyss Delve playable room chain", () => {
  it("boots into a playable room snapshot", () => {
    const harness = createAbyssTestHarness();
    harness.tick(16);

    const snapshot = harness.abyss.snapshot();
    expect(snapshot.running).toBe(true);
    expect(snapshot.objective.label).toBe("Clear the chamber");
    expect(snapshot.objective.remainingEnemies).toBeGreaterThanOrEqual(3);
    expect(snapshot.player.health).toBeGreaterThan(0);
    expect(snapshot.skills.map((skill) => skill.key)).toEqual(["LMB", "RMB", "1", "Space"]);
    expect(snapshot.contentSummary.activeRoomId).toBe("room.bootstrap");
    expect(snapshot.contentSummary.activeWaveId).toBe("wave.bootstrap");
    expect(snapshot.contentSummary.activeRewardPoolId).toBe("rewardPool.bootstrap");
    expect(snapshot.contentSummary.documents).toBeGreaterThan(20);
    expect(snapshot.contentSummary.references).toBeGreaterThan(20);
  });

  it("runs input to damage to death to loot to pickup to reward", () => {
    const harness = createAbyssTestHarness();

    const firstEnemy = harness.livingEnemies()[0];
    expect(firstEnemy).toBeDefined();
    harness.attack(firstEnemy!);

    expect(harness.abyss.runtime.world.query([Loot]).length).toBeGreaterThan(0);
    expect(
      harness.abyss.snapshot().timeline.some((entry) => entry.label.includes("defeated"))
    ).toBe(true);

    harness.pickupFirstLoot();
    expect(harness.abyss.run.recentLoot.length).toBeGreaterThan(0);

    for (let step = 0; step < 12 && harness.livingEnemies().length > 0; step += 1) {
      const enemy = harness.livingEnemies()[0]!;
      harness.attack(enemy);
    }

    expect(harness.abyss.snapshot().rewardOpen).toBe(true);
    const reward = harness.abyss.snapshot().rewardChoices[0]!;
    harness.abyss.input.rewardChoiceRequested = reward.id;
    harness.tick(80);

    const snapshot = harness.abyss.snapshot();
    expect(snapshot.rewardOpen).toBe(false);
    expect(snapshot.objective.roomId).toBe("room.elite-preview");
    expect(snapshot.objective.remainingEnemies).toBeGreaterThan(0);
    expect(snapshot.rewardChoices.some((choice) => choice.selected)).toBe(true);
    expect(snapshot.tcaTraces.some((trace) => trace.ruleId === "rule.reward.selected")).toBe(true);
  });
});
