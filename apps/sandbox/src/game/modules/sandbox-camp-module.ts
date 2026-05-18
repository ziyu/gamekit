import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { spawnSandboxCamp } from "./sandbox-camp/spawn";
import { registerSandboxCampSystems } from "./sandbox-camp/systems";
import type { SandboxCampModuleOptions } from "./sandbox-camp/types";

export type { SandboxCampModuleOptions } from "./sandbox-camp/types";

export function createSandboxCampModule(options: SandboxCampModuleOptions) {
  return defineGameModule<GameInstallContext>({
    id: "sandbox.camp",
    install(ctx) {
      const state = spawnSandboxCamp(ctx, options);
      registerSandboxCampSystems(ctx, options, state);
    }
  });
}
