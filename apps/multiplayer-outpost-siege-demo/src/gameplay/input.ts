import type { InputActionEvent, InputRouter } from "@gamekit/input-core";

export const OUTPOST_GAME_CONTEXT_ID = "outpost.gameplay";

export const OUTPOST_ACTION = {
  moveUp: "outpost.move.up",
  moveDown: "outpost.move.down",
  moveLeft: "outpost.move.left",
  moveRight: "outpost.move.right",
  aim: "outpost.aim",
  primary: "outpost.ability.primary",
  dash: "outpost.ability.dash",
  shockField: "outpost.ability.shock-field",
  deployTurret: "outpost.build.turret",
  cameraZoom: "outpost.camera.zoom"
} as const;

export type OutpostInputState = {
  held: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  primaryRequested: boolean;
  dashRequested: boolean;
  shockFieldRequested: boolean;
  deployTurretRequested: boolean;
  cameraZoomDelta: number;
  cameraZoomX?: number | undefined;
  cameraZoomY?: number | undefined;
};

export function createOutpostInputState(): OutpostInputState {
  return {
    held: { up: false, down: false, left: false, right: false },
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    primaryRequested: false,
    dashRequested: false,
    shockFieldRequested: false,
    deployTurretRequested: false,
    cameraZoomDelta: 0
  };
}

export function configureOutpostInputRouter(router: InputRouter): void {
  router.addContext({
    id: OUTPOST_GAME_CONTEXT_ID,
    priority: 100,
    scopes: ["game"],
    capture: true,
    actionIds: Object.values(OUTPOST_ACTION)
  });

  registerMovement(router, OUTPOST_ACTION.moveUp, "Move up", "KeyW");
  registerMovement(router, OUTPOST_ACTION.moveDown, "Move down", "KeyS");
  registerMovement(router, OUTPOST_ACTION.moveLeft, "Move left", "KeyA");
  registerMovement(router, OUTPOST_ACTION.moveRight, "Move right", "KeyD");
  register(router, OUTPOST_ACTION.aim, "Aim", [{ device: "mouse", phase: "moved" }]);
  register(router, OUTPOST_ACTION.primary, "Rifle fire", [
    { device: "mouse", button: "primary", phase: "pressed" }
  ]);
  register(router, OUTPOST_ACTION.dash, "Dash", [
    { device: "keyboard", code: "Space", phase: "pressed" }
  ]);
  register(router, OUTPOST_ACTION.shockField, "Shock field", [
    { device: "keyboard", code: "KeyQ", phase: "pressed" }
  ]);
  register(router, OUTPOST_ACTION.deployTurret, "Deploy turret", [
    { device: "keyboard", code: "KeyE", phase: "pressed" }
  ]);
  register(router, OUTPOST_ACTION.cameraZoom, "Camera zoom", [
    { device: "mouse", phase: "scrolled" }
  ]);
}

export function applyOutpostInputAction(state: OutpostInputState, event: InputActionEvent): void {
  const active = event.phase !== "released" && event.phase !== "cancelled";
  switch (event.actionId) {
    case OUTPOST_ACTION.moveUp:
      state.held.up = active;
      updateMovement(state);
      return;
    case OUTPOST_ACTION.moveDown:
      state.held.down = active;
      updateMovement(state);
      return;
    case OUTPOST_ACTION.moveLeft:
      state.held.left = active;
      updateMovement(state);
      return;
    case OUTPOST_ACTION.moveRight:
      state.held.right = active;
      updateMovement(state);
      return;
    case OUTPOST_ACTION.aim:
      state.aimX = event.input.x ?? state.aimX;
      state.aimY = event.input.y ?? state.aimY;
      return;
    case OUTPOST_ACTION.primary:
      state.primaryRequested ||= event.phase === "pressed";
      return;
    case OUTPOST_ACTION.dash:
      state.dashRequested ||= event.phase === "pressed";
      return;
    case OUTPOST_ACTION.shockField:
      state.shockFieldRequested ||= event.phase === "pressed";
      return;
    case OUTPOST_ACTION.deployTurret:
      state.deployTurretRequested ||= event.phase === "pressed";
      return;
    case OUTPOST_ACTION.cameraZoom:
      state.cameraZoomDelta = event.input.wheelDelta ?? 0;
      state.cameraZoomX = event.input.x;
      state.cameraZoomY = event.input.y;
  }
}

export function clearOutpostTransientInput(state: OutpostInputState): void {
  state.primaryRequested = false;
  state.dashRequested = false;
  state.shockFieldRequested = false;
  state.deployTurretRequested = false;
  state.cameraZoomDelta = 0;
  delete state.cameraZoomX;
  delete state.cameraZoomY;
}

function updateMovement(state: OutpostInputState): void {
  state.moveX = (state.held.right ? 1 : 0) - (state.held.left ? 1 : 0);
  state.moveY = (state.held.down ? 1 : 0) - (state.held.up ? 1 : 0);
}

function registerMovement(router: InputRouter, id: string, name: string, code: string): void {
  register(router, id, name, [
    { device: "keyboard", code, phase: "pressed" },
    { device: "keyboard", code, phase: "held" },
    { device: "keyboard", code, phase: "released" }
  ]);
}

function register(
  router: InputRouter,
  id: string,
  name: string,
  defaultBindings: Parameters<InputRouter["registerAction"]>[0]["defaultBindings"]
): void {
  router.registerAction({ id, name, category: "gameplay", scopes: ["game"], defaultBindings });
}
