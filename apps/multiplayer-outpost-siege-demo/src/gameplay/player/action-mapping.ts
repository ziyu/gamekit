import type { InputActionEvent } from "@gamekit/input-core";

import type { OutpostPlayerAction } from "../../domain";
import { OUTPOST_ACTION } from "../input";

export function outpostPlayerActionForInputAction(
  event: InputActionEvent
): OutpostPlayerAction | undefined {
  if (event.phase !== "pressed") {
    return undefined;
  }
  switch (event.actionId) {
    case OUTPOST_ACTION.reload:
      return "reload";
    case OUTPOST_ACTION.dash:
      return "dash";
    case OUTPOST_ACTION.shockField:
      return "shock-field";
    case OUTPOST_ACTION.deployTurret:
      return "deploy-turret";
    default:
      return undefined;
  }
}
