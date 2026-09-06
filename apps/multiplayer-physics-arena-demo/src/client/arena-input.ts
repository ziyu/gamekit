import type { ArenaItemActionType } from "../items/item-action";
import type { ArenaClientInput } from "./session";
import type { ArenaInputDevice } from "./arena-ui-model";

export type ArenaInputController = {
  sample(): ArenaClientInput;
  device(): ArenaInputDevice;
  dispose(): void;
};

export type ArenaGamepadFrame = {
  moveX: number;
  moveZ: number;
  jump: boolean;
  interact: boolean;
  use: boolean;
  drop: boolean;
  previousTarget: boolean;
  nextTarget: boolean;
  active: boolean;
};

const GAMEPLAY_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyE",
  "KeyF",
  "KeyQ",
  "BracketLeft",
  "BracketRight"
]);

export function createArenaInputController(
  viewport: HTMLElement,
  callbacks: {
    onItemAction(action: ArenaItemActionType): void;
    onSpectatorCycle(direction: -1 | 1): void;
    onDeviceChange?(device: ArenaInputDevice): void;
  }
): ArenaInputController {
  const pressed = new Set<string>();
  let jumpRequested = false;
  let inputDevice: ArenaInputDevice = "keyboard";
  let previousGamepadButtons: readonly boolean[] = [];

  const setDevice = (device: ArenaInputDevice) => {
    if (device === inputDevice) return;
    inputDevice = device;
    callbacks.onDeviceChange?.(device);
  };
  const hasScope = () => {
    const active = document.activeElement;
    return active === viewport || (active instanceof HTMLElement && viewport.contains(active));
  };
  const keydown = (event: KeyboardEvent) => {
    if (!hasScope() || isTextOrControlTarget(event.target)) return;
    if (GAMEPLAY_CODES.has(event.code)) event.preventDefault();
    pressed.add(event.code);
    if (GAMEPLAY_CODES.has(event.code)) setDevice("keyboard");
    if (event.code === "Space" && !event.repeat) jumpRequested = true;
    if (event.repeat) return;
    if (event.code === "KeyE") callbacks.onItemAction("interact");
    if (event.code === "KeyF") callbacks.onItemAction("use");
    if (event.code === "KeyQ") callbacks.onItemAction("drop");
    if (event.code === "BracketLeft") callbacks.onSpectatorCycle(-1);
    if (event.code === "BracketRight") callbacks.onSpectatorCycle(1);
  };
  const keyup = (event: KeyboardEvent) => pressed.delete(event.code);
  const clear = () => {
    pressed.clear();
    jumpRequested = false;
    previousGamepadButtons = [];
  };
  const focusViewport = (event: PointerEvent) => {
    if (!isTextOrControlTarget(event.target)) viewport.focus({ preventScroll: true });
  };

  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clear);
  viewport.addEventListener("pointerdown", focusViewport);

  return {
    sample() {
      if (!hasScope()) {
        jumpRequested = false;
        previousGamepadButtons = [];
        return { moveX: 0, moveZ: 0, jump: false };
      }
      const gamepad = firstStandardGamepad();
      const gamepadFrame = readArenaStandardGamepad(gamepad, previousGamepadButtons);
      previousGamepadButtons = gamepad?.buttons.map(({ pressed }) => pressed) ?? [];
      if (gamepadFrame.active) setDevice("gamepad");
      if (gamepadFrame.interact) callbacks.onItemAction("interact");
      if (gamepadFrame.use) callbacks.onItemAction("use");
      if (gamepadFrame.drop) callbacks.onItemAction("drop");
      if (gamepadFrame.previousTarget) callbacks.onSpectatorCycle(-1);
      if (gamepadFrame.nextTarget) callbacks.onSpectatorCycle(1);

      const keyboardX =
        Number(pressed.has("KeyD") || pressed.has("ArrowRight")) -
        Number(pressed.has("KeyA") || pressed.has("ArrowLeft"));
      const keyboardZ =
        Number(pressed.has("KeyS") || pressed.has("ArrowDown")) -
        Number(pressed.has("KeyW") || pressed.has("ArrowUp"));
      const keyboardActive = keyboardX !== 0 || keyboardZ !== 0 || jumpRequested;
      if (keyboardActive) setDevice("keyboard");
      const useGamepad = gamepadFrame.active && !keyboardActive;
      const result = {
        moveX: useGamepad ? gamepadFrame.moveX : keyboardX,
        moveZ: useGamepad ? gamepadFrame.moveZ : keyboardZ,
        jump: jumpRequested || gamepadFrame.jump
      };
      jumpRequested = false;
      return result;
    },
    device: () => inputDevice,
    dispose() {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      viewport.removeEventListener("pointerdown", focusViewport);
      clear();
    }
  };
}

export function readArenaStandardGamepad(
  gamepad: Pick<Gamepad, "axes" | "buttons"> | undefined,
  previousButtons: readonly boolean[] = []
): ArenaGamepadFrame {
  if (gamepad === undefined) {
    return {
      moveX: 0,
      moveZ: 0,
      jump: false,
      interact: false,
      use: false,
      drop: false,
      previousTarget: false,
      nextTarget: false,
      active: false
    };
  }
  const moveX = applyArenaGamepadDeadZone(gamepad.axes[0] ?? 0);
  const moveZ = applyArenaGamepadDeadZone(gamepad.axes[1] ?? 0);
  const button = (index: number) => gamepad.buttons[index]?.pressed === true;
  const edge = (index: number) => button(index) && previousButtons[index] !== true;
  const jump = edge(0);
  const interact = edge(2);
  const use = edge(7);
  const drop = edge(1);
  const previousTarget = edge(4);
  const nextTarget = edge(5);
  return {
    moveX,
    moveZ,
    jump,
    interact,
    use,
    drop,
    previousTarget,
    nextTarget,
    active:
      Math.abs(moveX) > 0 ||
      Math.abs(moveZ) > 0 ||
      jump ||
      interact ||
      use ||
      drop ||
      previousTarget ||
      nextTarget
  };
}

export function applyArenaGamepadDeadZone(value: number, deadZone = 0.18): number {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(value) || magnitude <= deadZone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (1 - deadZone));
}

function firstStandardGamepad(): Gamepad | undefined {
  if (typeof navigator.getGamepads !== "function") return undefined;
  return [...navigator.getGamepads()].find(
    (gamepad): gamepad is Gamepad =>
      gamepad !== null && gamepad.connected && gamepad.mapping === "standard"
  );
}

function isTextOrControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
