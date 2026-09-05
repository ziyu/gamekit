import { ARENA_COMPILED_CONTENT } from "../content/default-content";

export const ARENA_STAGE_SELECTION_METADATA_KEY = "arenaStageSelection";
export const ARENA_RANDOM_STAGE_SELECTION = "random";

export type ArenaStageSelection = typeof ARENA_RANDOM_STAGE_SELECTION | `stage.${string}`;

export type ResolvedArenaStageSelection = {
  requested: ArenaStageSelection;
  stageId: string;
  stageIndex: number;
};

export function arenaStageSelectionOptions(): Array<{
  value: ArenaStageSelection;
  label: string;
}> {
  return [
    { value: ARENA_RANDOM_STAGE_SELECTION, label: "RANDOM DRAW" },
    ...ARENA_COMPILED_CONTENT.stages.map((stage) => ({
      value: stage.definition.id as ArenaStageSelection,
      label: arenaStageSelectionLabel(stage.definition.id)
    }))
  ];
}

export function readArenaStageSelection(value: unknown): ArenaStageSelection | undefined {
  if (value === ARENA_RANDOM_STAGE_SELECTION) return value;
  if (
    typeof value === "string" &&
    ARENA_COMPILED_CONTENT.stages.some((stage) => stage.definition.id === value)
  ) {
    return value as ArenaStageSelection;
  }
  return undefined;
}

export function resolveArenaStageSelection(
  selection: ArenaStageSelection,
  random: () => number = Math.random
): ResolvedArenaStageSelection {
  const stages = ARENA_COMPILED_CONTENT.stages;
  const stageIndex =
    selection === ARENA_RANDOM_STAGE_SELECTION
      ? randomStageIndex(stages.length, random())
      : stages.findIndex((stage) => stage.definition.id === selection);
  if (stageIndex < 0) {
    throw new Error(`Unknown Knockout Arena stage selection: ${selection}`);
  }
  return {
    requested: selection,
    stageId: stages[stageIndex]!.definition.id,
    stageIndex
  };
}

function arenaStageSelectionLabel(stageId: string): string {
  return stageId
    .replace(/^stage\./, "")
    .split("-")
    .map((part) => part.toUpperCase())
    .join(" ");
}

function randomStageIndex(stageCount: number, sample: number): number {
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error("Knockout Arena random stage sample must be in [0, 1)");
  }
  return Math.floor(sample * stageCount);
}
