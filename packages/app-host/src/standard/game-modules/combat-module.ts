import {
  createCombatHandle,
  createCombatModule,
  type CreateCombatModuleConfig
} from "@gamekit/combat";
import { resolveStandardValue } from "../resolve";
import type { StandardServiceBuildContext, StandardValue } from "../types";

export function createStandardCombatModule<TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  options: StandardValue<CreateCombatModuleConfig, TContext>
) {
  const resolved = resolveStandardValue(ctx, options);
  const handle = resolved.handle ?? createCombatHandle();
  ctx.state.combat = handle;
  return createCombatModule({ ...resolved, handle });
}
