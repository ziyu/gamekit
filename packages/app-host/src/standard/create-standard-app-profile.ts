import type { AppProfile } from "../definition/types";
import type { CreateStandardAppProfileOptions } from "./types";

export function createStandardAppProfile<TContext>(
  options: CreateStandardAppProfileOptions<TContext>
): AppProfile<TContext> {
  return {
    id: options.id,
    ...(options.configSources === undefined ? {} : { configSources: options.configSources }),
    ...(options.adapters === undefined ? {} : { adapters: options.adapters }),
    ...(options.services === undefined ? {} : { standard: options.services }),
    ...(options.expose === undefined ? {} : { exposeStandard: options.expose }),
    ...(options.extensions === undefined ? {} : { extensions: options.extensions })
  };
}
