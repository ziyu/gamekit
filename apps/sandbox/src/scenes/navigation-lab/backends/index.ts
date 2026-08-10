import {
  navigationLabBackendPresentation,
  navigationLabBackendSummary,
  type NavigationLabBackendProvider,
  type NavigationLabBackendPresentation,
  type NavigationLabBackendSummary
} from "./contract";
import { GRAPH_NAVIGATION_LAB_BACKEND } from "./graph-provider";
import { GRID_NAVIGATION_LAB_BACKEND } from "./grid-provider";

const NAVIGATION_LAB_BACKENDS = [
  GRAPH_NAVIGATION_LAB_BACKEND,
  GRID_NAVIGATION_LAB_BACKEND
] as const;

export function listNavigationLabBackendProviders(): readonly NavigationLabBackendProvider[] {
  return NAVIGATION_LAB_BACKENDS;
}

export function listNavigationLabBackendSummaries(): NavigationLabBackendSummary[] {
  return NAVIGATION_LAB_BACKENDS.map(navigationLabBackendSummary);
}

export function listNavigationLabBackendPresentations(): NavigationLabBackendPresentation[] {
  return NAVIGATION_LAB_BACKENDS.map(navigationLabBackendPresentation);
}

export function requireNavigationLabBackendProvider(id: string): NavigationLabBackendProvider {
  const provider = NAVIGATION_LAB_BACKENDS.find((candidate) => candidate.id === id);
  if (!provider) {
    throw new Error(`Unknown Navigation Lab backend: ${id}`);
  }
  return provider;
}

export {
  GRAPH_NAVIGATION_LAB_BACKEND,
  createGraphNavigationLabBackendProvider
} from "./graph-provider";
export {
  GRID_NAVIGATION_LAB_BACKEND,
  createGridNavigationLabBackendProvider
} from "./grid-provider";
export type {
  NavigationLabBackendProvider,
  NavigationLabBackendPresentation,
  NavigationLabBackendSummary,
  NavigationLabObstacleBindings
} from "./contract";
export {
  NAVIGATION_LAB_DEBUG_LAYERS,
  type NavigationLabBackendDebugView,
  type NavigationLabDebugLayerId,
  type NavigationLabDebugShape,
  type NavigationLabDebugStateBinding,
  type NavigationLabDebugTraversal
} from "./debug-view";
