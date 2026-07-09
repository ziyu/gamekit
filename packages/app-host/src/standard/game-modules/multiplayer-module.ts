import {
  createMultiplayerBridgeModule,
  type CreateMultiplayerBridgeModuleOptions
} from "@gamekit/multiplayer-core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { resolveStandardValue } from "../resolve";
import type { StandardMultiplayerGameModuleOptions, StandardServiceBuildContext } from "../types";

export function createStandardMultiplayerModule<TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  options: StandardMultiplayerGameModuleOptions<TContext>
) {
  const runtime =
    options.runtime === undefined
      ? ctx.state.multiplayer
      : resolveStandardValue(ctx, options.runtime);
  if (!runtime) {
    throw new Error("Standard multiplayer game module requires the multiplayer service");
  }

  const bridgeOptions: CreateMultiplayerBridgeModuleOptions<GameInstallContext> = {
    runtime
  };
  if (options.handleCommand !== undefined) {
    bridgeOptions.handleCommand = options.handleCommand;
  }
  if (options.id !== undefined) {
    bridgeOptions.id = options.id;
  }
  if (options.commandKinds !== undefined) {
    bridgeOptions.commandKinds = options.commandKinds;
  }
  if (options.authority !== undefined) {
    bridgeOptions.authority = options.authority;
  }
  if (options.presentation !== undefined) {
    bridgeOptions.presentation = resolveStandardValue(ctx, options.presentation);
  }

  return createMultiplayerBridgeModule<GameInstallContext>(bridgeOptions);
}
