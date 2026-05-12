import type { GameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { resolveStandardValue } from "../resolve";
import type { StandardGameOptions, StandardServiceBuildContext } from "../types";
import { createStandardCameraModule } from "./camera-module";
import { createStandardTcaModule } from "./tca-module";

export function createStandardGameModules<TContext>(
  ctx: StandardServiceBuildContext<TContext>,
  options: StandardGameOptions<TContext>
): Array<GameModule<GameInstallContext>> {
  const modules: Array<GameModule<GameInstallContext>> = [];
  const standardModules = options.standardModules;

  if (standardModules?.tca) {
    modules.push(createStandardTcaModule(ctx, standardModules.tca));
  }

  if (standardModules?.camera) {
    const camera = resolveStandardValue(ctx, standardModules.camera.controller);

    modules.push(
      createStandardCameraModule({
        id: standardModules.camera.id,
        controller: camera,
        inputEventType: standardModules.camera.inputEventType,
        actions:
          standardModules.camera.actions === undefined
            ? []
            : resolveStandardValue(ctx, standardModules.camera.actions),
        smoothing:
          standardModules.camera.smoothing === undefined
            ? undefined
            : resolveStandardValue(ctx, standardModules.camera.smoothing),
        sync: standardModules.camera.sync,
        buildContext: ctx
      })
    );
  }

  modules.push(
    ...(options.modules === undefined ? [] : resolveStandardValue(ctx, options.modules))
  );

  return modules;
}
