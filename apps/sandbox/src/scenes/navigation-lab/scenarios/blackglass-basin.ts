import type { NavigationLabScenarioDefinition } from "../scenario";
import {
  BLACKGLASS_BASIN_FIELD_AGENT_STARTS,
  BLACKGLASS_BASIN_FIELD_SAMPLE_POINTS,
  BLACKGLASS_BASIN_TERRAIN
} from "./blackglass-basin-terrain";

export const BLACKGLASS_BASIN_SCENARIO = {
  id: "blackglass-basin",
  campaignLabel: "Navigation Playground · Expedition Map 11",
  title: "Blackglass Basin",
  mission: "Navigate the reactor district from Relay Camp to the isolated Aegis Vault",
  description:
    "A tile-authored industrial district with buildings, courtyards, dead ends, three constrained crossings, and a dormant transit relay.",
  complexity: "Deep test",
  mapPrompt: "Find a route through the reactor district",
  objectiveTitle: "Reach Aegis Vault",
  objectiveDetail: "Read the terrain, clear a crossing, and avoid sealed districts",
  startLocation: "Relay Camp",
  goalLocation: "Aegis Vault",
  startMarker: "CONVOY",
  goalMarker: "VAULT",
  goalKey: "aegis-vault-evacuation-yard",
  bounds: BLACKGLASS_BASIN_TERRAIN.bounds,
  start: BLACKGLASS_BASIN_TERRAIN.start,
  goal: BLACKGLASS_BASIN_TERRAIN.goal,
  fieldAgentStarts: BLACKGLASS_BASIN_FIELD_AGENT_STARTS,
  fieldSamplePoints: BLACKGLASS_BASIN_FIELD_SAMPLE_POINTS,
  controls: {
    bridge: {
      label: "Blast Doors",
      detail: "Seal or reopen the armored central causeway",
      openState: "Blast doors open",
      blockedState: "Blast doors sealed"
    },
    marsh: {
      label: "Coolant Fields",
      detail: "Cycle stable, leaking, and toxic coolant",
      normalState: "Coolant stable",
      costlyState: "Coolant leaking",
      blockedState: "Coolant toxic"
    },
    portal: {
      label: "Transit Relay",
      detail: "Bring the direct emergency relay online",
      disabledState: "Transit relay offline",
      enabledState: "Transit relay online"
    },
    lockdown: {
      label: "Reactor Lockdown",
      detail: "Seal the doors, gantry, coolant fields, and relay",
      hudLabel: "REACTOR LOCKDOWN"
    },
    resetLabel: "Restore Blackglass Basin"
  }
} as const satisfies NavigationLabScenarioDefinition;
