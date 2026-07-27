import { describe, expect, it } from "vitest";
import { createAiLabStressTest } from "./stress-test";

describe("AI Lab capacity stress test", () => {
  it("ramps through real population levels and reports the configured stable ceiling", () => {
    const populations: number[] = [];
    const stress = createAiLabStressTest({
      baseAnimals: 16,
      resizePopulation(value) {
        populations.push(value);
      }
    });
    stress.configureMaxAnimals(64);
    stress.start();

    sampleLevel(stress, 2);
    sampleLevel(stress, 2);
    const snapshot = stress.snapshot(populations.at(-1) ?? 0, 64);

    expect(populations).toEqual([32, 64, 16]);
    expect(snapshot).toMatchObject({
      status: "complete",
      configuredMaxAnimals: 64,
      stableAnimals: 64,
      lastTestedAnimals: 64,
      activeAnimals: 16,
      reachedConfiguredLimit: true,
      withinBudget: true
    });
    expect(snapshot.averageFps).toBeGreaterThan(60);
    expect(snapshot.p95SimulationMs).toBe(2);
  });

  it("keeps the previous stable level when a population misses the simulation budget", () => {
    const populations: number[] = [];
    const stress = createAiLabStressTest({
      baseAnimals: 16,
      resizePopulation(value) {
        populations.push(value);
      }
    });
    stress.configureMaxAnimals(32);
    stress.start();
    sampleLevel(stress, 35);
    const snapshot = stress.snapshot(populations.at(-1) ?? 0, 32);

    expect(populations).toEqual([32, 16]);
    expect(snapshot).toMatchObject({
      status: "complete",
      stableAnimals: 16,
      lastTestedAnimals: 32,
      reachedConfiguredLimit: false,
      withinBudget: false
    });
    expect(snapshot.failureReason).toContain("模拟 p95");
  });

  it("waits for the navigation backlog to converge instead of requiring an empty queue", () => {
    const stress = createAiLabStressTest({
      baseAnimals: 16,
      resizePopulation() {}
    });
    stress.configureMaxAnimals(32);
    stress.start();

    sampleFrames(stress, 60, 12);
    expect(stress.snapshot(32, 32)).toMatchObject({
      status: "warming",
      pendingNavigationRequests: 12,
      backlogSettled: false
    });

    sampleFrames(stress, 17, 4);
    expect(stress.snapshot(32, 32)).toMatchObject({
      status: "sampling",
      pendingNavigationRequests: 4,
      backlogSettled: true,
      warmupTimedOut: false
    });
  });

  it("does not report a stable level when navigation startup backlog never converges", () => {
    const stress = createAiLabStressTest({
      baseAnimals: 16,
      resizePopulation() {}
    });
    stress.configureMaxAnimals(32);
    stress.start();

    sampleFrames(stress, 314, 12);
    expect(stress.snapshot(32, 32)).toMatchObject({
      status: "sampling",
      backlogSettled: false,
      warmupTimedOut: true
    });

    sampleFrames(stress, 101, 12);
    const snapshot = stress.snapshot(16, 16);
    expect(snapshot).toMatchObject({
      status: "complete",
      stableAnimals: 16,
      lastTestedAnimals: 32,
      withinBudget: false
    });
    expect(snapshot.failureReason).toContain("导航启动积压");
  });

  it("reads full runtime counters only at stress phase boundaries", () => {
    let runtimeReads = 0;
    const stress = createAiLabStressTest({
      baseAnimals: 16,
      resizePopulation() {}
    });
    stress.configureMaxAnimals(32);
    stress.start();

    for (let index = 0; index < 150; index += 1) {
      stress.sample({
        frameMs: 16,
        simulationMs: 2,
        runtime() {
          runtimeReads += 1;
          return zeroRuntimeCounters();
        },
        navigation: { pendingRequests: 0 }
      });
    }

    expect(stress.snapshot(16, 16).status).toBe("complete");
    expect(runtimeReads).toBe(2);
  });
});

function sampleLevel(stress: ReturnType<typeof createAiLabStressTest>, simulationMs: number): void {
  for (let index = 0; index < 150; index += 1) {
    stress.sample({
      frameMs: 16,
      simulationMs,
      runtime: zeroRuntimeCounters,
      navigation: { pendingRequests: 0 }
    });
  }
}

function sampleFrames(
  stress: ReturnType<typeof createAiLabStressTest>,
  frames: number,
  pendingRequests: number
): void {
  for (let index = 0; index < frames; index += 1) {
    stress.sample({
      frameMs: 16,
      simulationMs: 2,
      runtime: zeroRuntimeCounters,
      navigation: { pendingRequests }
    });
  }
}

function zeroRuntimeCounters() {
  return {
    delayedDecisions: 0,
    delayedSensorSamples: 0,
    rejectedPathRequests: 0
  };
}
