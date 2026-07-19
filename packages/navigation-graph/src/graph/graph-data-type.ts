import type { DataDiagnostic, DataDocument, DataTypeDefinition } from "@gamekit/data";
import type { NavigationGraphDefinition } from "./types";

export const NAVIGATION_GRAPH_TYPE = "navigation.graph";

export function createNavigationGraphDataType(): DataTypeDefinition<NavigationGraphDefinition> {
  return {
    type: NAVIGATION_GRAPH_TYPE,
    getTags: (graph) => graph.tags ?? [],
    validate(document) {
      const diagnostics: DataDiagnostic[] = [];
      if (!nonEmptyString(document.data.id)) {
        diagnostics.push(
          diagnostic(
            "navigation.graph_missing_id",
            "Navigation graph requires an id",
            document,
            "id"
          )
        );
      }
      if (!Array.isArray(document.data.nodes) || document.data.nodes.length === 0) {
        diagnostics.push(
          diagnostic(
            "navigation.graph_missing_nodes",
            "Navigation graph requires at least one node",
            document,
            "nodes"
          )
        );
      }
      const nodeIds = new Set<string>();
      for (const [index, node] of (document.data.nodes ?? []).entries()) {
        if (!nonEmptyString(node.id) || nodeIds.has(node.id)) {
          diagnostics.push(
            diagnostic(
              nodeIds.has(node.id)
                ? "navigation.graph_duplicate_node"
                : "navigation.graph_node_missing_id",
              "Navigation graph nodes require unique ids",
              document,
              `nodes[${index}].id`
            )
          );
        }
        nodeIds.add(node.id);
        if (!validPoint(node.point)) {
          diagnostics.push(
            diagnostic(
              "navigation.graph_invalid_node_point",
              "Navigation graph node point must be finite",
              document,
              `nodes[${index}].point`
            )
          );
        }
      }
      const edgeIds = new Set<string>();
      for (const [index, edge] of (document.data.edges ?? []).entries()) {
        if (!nonEmptyString(edge.id) || edgeIds.has(edge.id)) {
          diagnostics.push(
            diagnostic(
              edgeIds.has(edge.id)
                ? "navigation.graph_duplicate_edge"
                : "navigation.graph_edge_missing_id",
              "Navigation graph edges require unique ids",
              document,
              `edges[${index}].id`
            )
          );
        }
        edgeIds.add(edge.id);
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) {
          diagnostics.push(
            diagnostic(
              "navigation.graph_invalid_edge_nodes",
              "Navigation graph edge must connect two different existing nodes",
              document,
              `edges[${index}]`
            )
          );
        }
        if (edge.cost !== undefined && (!Number.isFinite(edge.cost) || edge.cost <= 0)) {
          diagnostics.push(
            diagnostic(
              "navigation.graph_invalid_edge_cost",
              "Navigation graph edge cost must be positive and finite",
              document,
              `edges[${index}].cost`
            )
          );
        }
      }
      return diagnostics;
    }
  };
}

function diagnostic(
  code: string,
  message: string,
  document: DataDocument,
  path: string
): DataDiagnostic {
  return {
    code,
    message,
    severity: "error",
    key: { type: document.type, id: document.id },
    path,
    ...(document.sourcePackId === undefined ? {} : { sourcePackId: document.sourcePackId })
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validPoint(point: NavigationGraphDefinition["nodes"][number]["point"]): boolean {
  return (
    Number.isFinite(point?.x) &&
    Number.isFinite(point?.y) &&
    (point?.z === undefined || Number.isFinite(point.z))
  );
}
