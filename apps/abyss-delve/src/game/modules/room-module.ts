import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { AbyssRuntimeState } from "../runtime-state";
import { enterAbyssRoom } from "./room-helpers";

export function createAbyssRoomModule(state: AbyssRuntimeState) {
  return defineGameModule<GameInstallContext>({
    id: "abyss.room",
    install() {
      enterAbyssRoom(state, "room.bootstrap");
    }
  });
}
