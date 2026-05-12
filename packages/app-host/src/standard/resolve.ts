import { createAppHostError } from "../runtime/errors";
import type { StandardAdapterRef, StandardServiceBuildContext, StandardValue } from "./types";

export function resolveStandardValue<TValue, TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  value: StandardValue<TValue, TContext>
): TValue {
  return typeof value === "function"
    ? (value as (ctx: StandardServiceBuildContext<TContext>) => TValue)(ctx)
    : value;
}

export function resolveStandardAdapter<TValue, TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  ref: StandardAdapterRef<TValue>,
  serviceId: string
): TValue {
  if (typeof ref !== "string") {
    return ref;
  }

  const adapter = ctx.adapters[ref];
  if (adapter === undefined) {
    throw createAppHostError("app_host.missing_adapter", "Missing app profile adapter", {
      adapterId: ref,
      serviceId,
      profileId: ctx.profile.id,
      appId: ctx.app.id
    });
  }

  return adapter as TValue;
}
