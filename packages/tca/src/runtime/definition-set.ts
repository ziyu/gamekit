import type { TcaDefinitionSet } from "./types";

export function mergeTcaDefinitionSets(
  ...sets: Array<TcaDefinitionSet | undefined>
): TcaDefinitionSet {
  return {
    triggers: sets.flatMap((set) => set?.triggers ?? []),
    conditions: sets.flatMap((set) => set?.conditions ?? []),
    actions: sets.flatMap((set) => set?.actions ?? [])
  };
}
