import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { consumeMomentaryInput, type AbyssRuntimeState } from "../runtime-state";

export function createAbyssInputResetModule(state: AbyssRuntimeState) {
  return defineGameModule<GameInstallContext>({
    id: "abyss.input_reset",
    install({ systems }) {
      systems.register({
        id: "abyss.input_reset.system",
        update() {
          consumeMomentaryInput(state.input);
        }
      });
    }
  });
}
