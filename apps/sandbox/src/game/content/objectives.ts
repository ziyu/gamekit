import type { DataPackEntry } from "@gamekit/data";

export const sandboxObjectiveEntries: DataPackEntry[] = [
  {
    type: "sandbox.objectivePhase",
    id: "objective.sandbox.phase.bootstrap",
    data: {
      id: "objective.sandbox.phase.bootstrap",
      label: "Bootstrap Uplink",
      targetSignal: 220,
      unlocks: ["mode.stabilize"],
      reward: "Enable station stabilize automation",
      tags: ["sandbox", "objective"]
    }
  },
  {
    type: "sandbox.objectivePhase",
    id: "objective.sandbox.phase.fabricate",
    data: {
      id: "objective.sandbox.phase.fabricate",
      label: "Fabricate Relay Mesh",
      targetSignal: 420,
      unlocks: ["recipe.sandbox.module_fragment", "mode.boost"],
      reward: "Enable boost mode and visible fabricator layers",
      tags: ["sandbox", "objective", "asset"]
    }
  },
  {
    type: "sandbox.objectivePhase",
    id: "objective.sandbox.phase.decode",
    data: {
      id: "objective.sandbox.phase.decode",
      label: "Decode Counter-Rules",
      targetSignal: 720,
      unlocks: ["recipe.sandbox.rule_decode", "mode.suppress"],
      reward: "Enable interference suppression automation",
      tags: ["sandbox", "objective", "data"]
    }
  }
];
