import { describe, expect, it } from "vitest";

import { advanceArenaQualifierProgress } from "../match/qualifier-progress";
import type { ArenaGameplayVolumeDefinition } from "../content/types";

describe("Knockout Arena qualifier progress", () => {
  const checkpoints: ArenaGameplayVolumeDefinition[] = [
    volume("checkpoint.1", "checkpoint", 0, 1),
    volume("checkpoint.2", "checkpoint", -7.5, 2)
  ];
  const finish = volume("finish", "finish", -12.4, 3);

  it("requires ordered checkpoints before the authority accepts a finish", () => {
    const skipped = advanceArenaQualifierProgress({
      position: { x: 0, y: 1.2, z: -12.4 },
      startZ: 5.4,
      checkpoints,
      finish
    });
    expect(skipped).toMatchObject({ checkpointCount: 0, checkpointTotal: 2, finished: false });

    const checkpointOne = advanceArenaQualifierProgress({
      previous: skipped,
      position: { x: 0, y: 1.2, z: 0 },
      startZ: 5.4,
      checkpoints,
      finish
    });
    const checkpointTwo = advanceArenaQualifierProgress({
      previous: checkpointOne,
      position: { x: 0, y: 1.2, z: -7.5 },
      startZ: 5.4,
      checkpoints,
      finish
    });
    const finished = advanceArenaQualifierProgress({
      previous: checkpointTwo,
      position: { x: 0, y: 1.2, z: -12.4 },
      startZ: 5.4,
      checkpoints,
      finish
    });

    expect(checkpointOne.checkpointCount).toBe(1);
    expect(checkpointTwo.checkpointCount).toBe(2);
    expect(finished).toEqual({
      checkpointCount: 2,
      checkpointTotal: 2,
      finished: true,
      normalizedProgress: 1
    });
  });

  it("keeps accepted finish progress monotonic after the actor leaves the prediction island", () => {
    const finished = advanceArenaQualifierProgress({
      previous: {
        checkpointCount: 2,
        checkpointTotal: 2,
        finished: true,
        normalizedProgress: 1
      },
      position: { x: 0, y: 1.2, z: 5.4 },
      startZ: 5.4,
      checkpoints,
      finish
    });

    expect(finished.finished).toBe(true);
    expect(finished.normalizedProgress).toBe(1);
  });
});

function volume(
  id: string,
  kind: ArenaGameplayVolumeDefinition["kind"],
  z: number,
  routeOrder: number
): ArenaGameplayVolumeDefinition {
  return {
    id,
    kind,
    position: { x: 0, y: 1.2, z },
    size: { width: kind === "finish" ? 8 : 20, height: 3, depth: 1.5 },
    routeOrder
  };
}
