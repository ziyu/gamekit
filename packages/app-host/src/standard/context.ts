import type { AppServiceFactoryContext } from "../definition/types";
import type { StandardAppServiceState, StandardServiceBuildContext } from "./types";

export function createStandardContext<TContext>(
  ctx: AppServiceFactoryContext<TContext>,
  stateByContext: Map<TContext, StandardAppServiceState>
): StandardServiceBuildContext<TContext> {
  let state = stateByContext.get(ctx.context);
  if (!state) {
    state = {};
    stateByContext.set(ctx.context, state);
  }

  return {
    ...ctx,
    adapters: ctx.profile.adapters ?? {},
    serviceDefinitions: ctx.services,
    state
  };
}

export function exposeStandardState<TContext>(
  options: { exposeStandard?: ((ctx: StandardServiceBuildContext<TContext>) => void) | undefined },
  ctx: StandardServiceBuildContext<TContext>
): void {
  options.exposeStandard?.(ctx);
}
