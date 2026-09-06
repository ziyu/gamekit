import type { NavigationBackendAdapter } from "@gamekit/navigation-core/backend";
import type { CreateGridNavigationBackendOptions } from "../contracts/grid-definition";
import { createGridNavigationBackendRuntime } from "../runtime";

export function createGridNavigationBackend(
  options: CreateGridNavigationBackendOptions
): NavigationBackendAdapter {
  return createGridNavigationBackendRuntime(options);
}
