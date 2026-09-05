import { describe, expect, it } from "vitest";

import {
  ARENA_RANDOM_STAGE_SELECTION,
  arenaStageSelectionOptions,
  readArenaStageSelection,
  resolveArenaStageSelection,
  type ArenaStageSelection
} from "../shared/arena-stage-selection";

describe("Knockout Arena stage selection", () => {
  it("publishes random first and all compiled stages in match order", () => {
    expect(arenaStageSelectionOptions()).toEqual([
      { value: "random", label: "RANDOM DRAW" },
      { value: "stage.circuit-forge", label: "CIRCUIT FORGE" },
      { value: "stage.scrap-yard", label: "SCRAP YARD" },
      { value: "stage.crown-collapse", label: "CROWN COLLAPSE" }
    ]);
  });

  it("validates room metadata against compiled content", () => {
    expect(readArenaStageSelection("random")).toBe("random");
    expect(readArenaStageSelection("stage.scrap-yard")).toBe("stage.scrap-yard");
    expect(readArenaStageSelection("stage.unknown")).toBeUndefined();
    expect(readArenaStageSelection({ stage: "stage.crown-collapse" })).toBeUndefined();
  });

  it("resolves random on authority and preserves an explicit stage", () => {
    expect(resolveArenaStageSelection(ARENA_RANDOM_STAGE_SELECTION, () => 0)).toMatchObject({
      stageIndex: 0,
      stageId: "stage.circuit-forge"
    });
    expect(resolveArenaStageSelection(ARENA_RANDOM_STAGE_SELECTION, () => 0.5)).toMatchObject({
      stageIndex: 1,
      stageId: "stage.scrap-yard"
    });
    expect(resolveArenaStageSelection(ARENA_RANDOM_STAGE_SELECTION, () => 0.999)).toMatchObject({
      stageIndex: 2,
      stageId: "stage.crown-collapse"
    });
    expect(resolveArenaStageSelection("stage.scrap-yard")).toEqual({
      requested: "stage.scrap-yard",
      stageIndex: 1,
      stageId: "stage.scrap-yard"
    });
  });

  it("rejects invalid random sources and direct unknown selections", () => {
    expect(() => resolveArenaStageSelection("random", () => 1)).toThrow("must be in [0, 1)");
    expect(() => resolveArenaStageSelection("stage.unknown" as ArenaStageSelection)).toThrow(
      "Unknown Knockout Arena stage selection"
    );
  });
});
