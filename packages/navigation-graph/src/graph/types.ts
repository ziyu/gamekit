import type { NavigationPoint } from "@gamekit/navigation-core";

export type NavigationGraphNodeDefinition = {
  id: string;
  point: NavigationPoint;
  area?: string | undefined;
  tags?: string[] | undefined;
};

export type NavigationGraphEdgeDefinition = {
  id: string;
  from: string;
  to: string;
  cost?: number | undefined;
  area?: string | undefined;
  bidirectional?: boolean | undefined;
  enabled?: boolean | undefined;
  tags?: string[] | undefined;
};

export type NavigationGraphDefinition = {
  id: string;
  nodes: NavigationGraphNodeDefinition[];
  edges: NavigationGraphEdgeDefinition[];
  tags?: string[] | undefined;
};

export type CreateGraphNavigationBackendOptions = {
  id?: string | undefined;
  graph: NavigationGraphDefinition;
  maxRouteFields?: number | undefined;
};
