import type { PhaserCameraAdapter } from "@gamekit/camera-phaser";
import type { CameraController } from "@gamekit/camera-core";
import type { InputBinding, InputRouter } from "@gamekit/input-core";
import { applySandboxCameraAction } from "./camera";
import type { SandboxRuntime } from "./game";
import type { SandboxUiHandles } from "./ui/render-sandbox";
import { updateCameraStatus, updateInputStatus } from "./ui/render-sandbox";

export type SandboxInputContext = {
  ui: SandboxUiHandles;
  activeInputScope: SandboxInputScope;
  camera?: CameraController | undefined;
  cameraAdapter?: PhaserCameraAdapter | undefined;
  sandbox?: SandboxRuntime | undefined;
};

export function configureSandboxInputRouter(
  context: SandboxInputContext,
  inputRouter: InputRouter
): void {
  context.ui.rendererRoot.addEventListener("focus", () => {
    context.activeInputScope = "game";
  });
  context.ui.rendererRoot.addEventListener("blur", () => {
    context.activeInputScope = "ui";
  });
  inputRouter.registerAction({
    id: "camera.pan_up",
    name: "Pan Up",
    category: "camera",
    scopes: ["game"],
    defaultBindings: keyboardPanBindings("KeyW")
  });
  inputRouter.registerAction({
    id: "camera.pan_down",
    name: "Pan Down",
    category: "camera",
    scopes: ["game"],
    defaultBindings: keyboardPanBindings("KeyS")
  });
  inputRouter.registerAction({
    id: "camera.pan_left",
    name: "Pan Left",
    category: "camera",
    scopes: ["game"],
    defaultBindings: keyboardPanBindings("KeyA")
  });
  inputRouter.registerAction({
    id: "camera.pan_right",
    name: "Pan Right",
    category: "camera",
    scopes: ["game"],
    defaultBindings: keyboardPanBindings("KeyD")
  });
  inputRouter.registerAction({
    id: "camera.zoom_in",
    name: "Zoom In",
    category: "camera",
    scopes: ["game"],
    defaultBindings: [
      { device: "mouse", phase: "scrolled" },
      { device: "keyboard", code: "Equal", phase: "pressed" }
    ]
  });
  inputRouter.registerAction({
    id: "camera.zoom_out",
    name: "Zoom Out",
    category: "camera",
    scopes: ["game"],
    defaultBindings: [{ device: "keyboard", code: "Minus", phase: "pressed" }]
  });
  inputRouter.registerAction({
    id: "game.confirm",
    name: "Confirm",
    category: "gameplay",
    scopes: ["game"],
    defaultBindings: [{ device: "keyboard", code: "Enter", phase: "pressed" }]
  });
  inputRouter.addContext({
    id: "camera",
    priority: 10,
    actionIds: [
      "camera.pan_up",
      "camera.pan_down",
      "camera.pan_left",
      "camera.pan_right",
      "camera.zoom_in",
      "camera.zoom_out"
    ],
    scopes: ["game"],
    capture: false
  });
  inputRouter.addContext({
    id: "gameplay",
    priority: 5,
    actionIds: ["game.confirm"],
    scopes: ["game"]
  });
  inputRouter.onAction((event) => {
    const camera = requireInputContextValue(context.camera, "camera");
    if (applySandboxCameraAction(camera, event)) {
      context.cameraAdapter?.applyCameraState(camera.getState());
      updateCameraStatus(context.ui, camera.getState());
    }
    context.sandbox?.runtime.eventBus.emit(
      "input.action",
      {
        actionId: event.actionId,
        contextId: event.contextId,
        phase: event.phase,
        value: event.value
      },
      "sandbox.input"
    );
    updateInputStatus(context.ui, {
      action: event.actionId,
      context: event.contextId
    });
  });
}

export function resolveSandboxInputScope(
  context: SandboxInputContext,
  event: Event
): SandboxInputScope {
  if (isPointerLikeInput(event)) {
    context.activeInputScope = isEventInElement(event, context.ui.rendererRoot) ? "game" : "ui";
    if (context.activeInputScope === "game" && event.type === "pointerdown") {
      context.ui.rendererRoot.focus({ preventScroll: true });
    }
  }

  return context.activeInputScope;
}

function keyboardPanBindings(code: string): InputBinding[] {
  return [
    { device: "keyboard", code, phase: "pressed" },
    { device: "keyboard", code, phase: "held" }
  ];
}

function requireInputContextValue<TValue>(value: TValue | undefined, name: string): TValue {
  if (value === undefined) {
    throw new Error(`Missing sandbox input context value: ${name}`);
  }

  return value;
}

export type SandboxInputScope = "game" | "ui";

function isPointerLikeInput(event: Event): boolean {
  return event.type.startsWith("pointer") || event.type === "wheel";
}

function isEventInElement(event: Event, element: Element): boolean {
  return event.target instanceof Node && element.contains(event.target);
}
