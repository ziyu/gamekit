import {
  navigationLabBackendPresentation,
  type NavigationLabBackendPresentation,
  type NavigationLabBackendProvider
} from "../backends/contract";
import {
  BLACKGLASS_GRAPH_NAVIGATION_LAB_BACKEND,
  createBlackglassGraphNavigationLabBackendProvider
} from "../backends/blackglass-graph-provider";
import {
  BLACKGLASS_GRID_NAVIGATION_LAB_BACKEND,
  createBlackglassGridNavigationLabBackendProvider
} from "../backends/blackglass-grid-provider";
import {
  BLACKGLASS_RECAST_NAVIGATION_LAB_BACKEND,
  createBlackglassRecastNavigationLabBackendProvider
} from "../backends/blackglass-recast-provider";
import { GRAPH_NAVIGATION_LAB_BACKEND } from "../backends/graph-provider";
import { GRID_NAVIGATION_LAB_BACKEND } from "../backends/grid-provider";
import { ASHEN_FORD_SCENARIO, type NavigationLabScenarioDefinition } from "../scenario";
import { BLACKGLASS_BASIN_SCENARIO } from "./blackglass-basin";

export type NavigationLabScenarioProvider = {
  definition: NavigationLabScenarioDefinition;
  backends: readonly NavigationLabBackendProvider[];
};

export type NavigationLabScenarioPresentation = {
  definition: NavigationLabScenarioDefinition;
  backends: readonly NavigationLabBackendPresentation[];
};

const NAVIGATION_LAB_SCENARIOS = [
  {
    definition: ASHEN_FORD_SCENARIO,
    backends: [GRAPH_NAVIGATION_LAB_BACKEND, GRID_NAVIGATION_LAB_BACKEND]
  },
  {
    definition: BLACKGLASS_BASIN_SCENARIO,
    backends: [
      BLACKGLASS_GRAPH_NAVIGATION_LAB_BACKEND,
      BLACKGLASS_GRID_NAVIGATION_LAB_BACKEND,
      BLACKGLASS_RECAST_NAVIGATION_LAB_BACKEND
    ]
  }
] as const satisfies readonly NavigationLabScenarioProvider[];

export function listNavigationLabScenarioProviders(): readonly NavigationLabScenarioProvider[] {
  return NAVIGATION_LAB_SCENARIOS;
}

export function listNavigationLabScenarioPresentations(): NavigationLabScenarioPresentation[] {
  return NAVIGATION_LAB_SCENARIOS.map((scenario) => ({
    definition: scenario.definition,
    backends: scenario.backends.map(navigationLabBackendPresentation)
  }));
}

export function requireNavigationLabScenarioProvider(id: string): NavigationLabScenarioProvider {
  const scenario = NAVIGATION_LAB_SCENARIOS.find((candidate) => candidate.definition.id === id);
  if (!scenario) {
    throw new Error(`Unknown Navigation Lab scenario: ${id}`);
  }
  return scenario;
}

export function requireNavigationLabScenarioBackend(
  scenarioId: string,
  backendId: string
): NavigationLabBackendProvider {
  const scenario = requireNavigationLabScenarioProvider(scenarioId);
  const backend = scenario.backends.find((candidate) => candidate.id === backendId);
  if (!backend) {
    throw new Error(`Unknown Navigation Lab backend ${backendId} for scenario ${scenarioId}`);
  }
  return backend;
}

export {
  BLACKGLASS_BASIN_SCENARIO,
  BLACKGLASS_GRAPH_NAVIGATION_LAB_BACKEND,
  BLACKGLASS_GRID_NAVIGATION_LAB_BACKEND,
  BLACKGLASS_RECAST_NAVIGATION_LAB_BACKEND,
  createBlackglassGraphNavigationLabBackendProvider,
  createBlackglassGridNavigationLabBackendProvider,
  createBlackglassRecastNavigationLabBackendProvider
};
