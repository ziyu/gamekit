import {
  createAnimatorHandle,
  createAnimatorModule,
  type CreateAnimatorModuleOptions
} from "@gamekit/animator-core";
import { resolveStandardValue } from "../resolve";
import type { StandardServiceBuildContext, StandardValue } from "../types";

export function createStandardAnimatorModule<TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  options: StandardValue<CreateAnimatorModuleOptions, TContext>
) {
  const resolved = resolveStandardValue(ctx, options);
  const handle = resolved.handle ?? createAnimatorHandle();
  ctx.state.animator = handle;
  return createAnimatorModule({ ...resolved, handle });
}
