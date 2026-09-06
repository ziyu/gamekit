import type { GasActiveEffectState, GasOperationContext } from "./types";

export function childGasContext(
  context: GasOperationContext | undefined,
  parentId: string
): GasOperationContext {
  return {
    ...(context?.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    parentId
  };
}

export function activeEffectContext(active: GasActiveEffectState): GasOperationContext {
  return {
    ...(active.correlationId === undefined ? {} : { correlationId: active.correlationId }),
    ...(active.parentTraceId === undefined ? {} : { parentId: active.parentTraceId })
  };
}
