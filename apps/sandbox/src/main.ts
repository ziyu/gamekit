import "./styles.css";
import { createAssetManager } from "@gamekit/asset";
import { createPhaserAssetAdapter } from "@gamekit/asset-phaser";
import type { CameraState2D } from "@gamekit/camera-core";
import { createPhaserCameraAdapter, type PhaserCameraAdapter } from "@gamekit/camera-phaser";
import { createInputRouter, type InputBinding } from "@gamekit/input-core";
import { createDomInputAdapter } from "@gamekit/input-dom";
import { createWebPlatform } from "@gamekit/platform-web";
import {
  createPhaserRenderer,
  type PhaserRendererAssetRuntime,
  type PhaserRendererDriverRuntime
} from "@gamekit/renderer-phaser";
import { applySandboxCameraAction, createSandboxCameraController } from "./camera";
import {
  createSandboxDataRegistry,
  createSandboxRuntime,
  SANDBOX_ASSET_GROUP,
  SANDBOX_RENDER_SIZE
} from "./game";
import {
  renderSandboxShell,
  updateAssetStatus,
  updateCameraStatus,
  updateDataStatus,
  updateInputStatus,
  updatePlatformStatus,
  updateSandboxHud
} from "./ui/render-sandbox";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;
void bootSandbox(appElement);

async function bootSandbox(root: HTMLElement): Promise<void> {
  const ui = renderSandboxShell(root);
  let activeInputScope: SandboxInputScope = "ui";
  ui.rendererRoot.addEventListener("focus", () => {
    activeInputScope = "game";
  });
  ui.rendererRoot.addEventListener("blur", () => {
    activeInputScope = "ui";
  });
  const platform = createWebPlatform({ appName: "GameKit Sandbox" });
  let phaserRuntime: PhaserRendererDriverRuntime | undefined;
  const renderer = createPhaserRenderer({
    onRuntime: (runtime) => {
      phaserRuntime = runtime;
    }
  });
  const camera = createSandboxCameraController(SANDBOX_RENDER_SIZE);
  const dataRegistry = createSandboxDataRegistry();
  const sandbox = createSandboxRuntime({
    renderer,
    renderSize: SANDBOX_RENDER_SIZE,
    dataRegistry
  });
  const inputRouter = createInputRouter();

  await renderer.boot({
    container: ui.rendererRoot,
    width: SANDBOX_RENDER_SIZE.width,
    height: SANDBOX_RENDER_SIZE.height,
    onDiagnostic: (event) => {
      sandbox.runtime.eventBus.emit(event.type, event.payload, event.source);
    },
    debug: true
  });
  const assetManager = createAssetManager({
    adapter: createPhaserAssetAdapter({
      runtime: requirePhaserAssetRuntime(phaserRuntime)
    }),
    onDiagnostic: (event) => {
      sandbox.runtime.eventBus.emit(event.type, event.payload, event.source);
    }
  });
  assetManager.registerFromDataRegistry(dataRegistry);
  updateDataStatus(ui, dataRegistry);
  updateAssetStatus(ui, assetManager);
  await assetManager.loadGroup(SANDBOX_ASSET_GROUP);
  updateAssetStatus(ui, assetManager);
  const cameraAdapter = createCameraAdapter(phaserRuntime);
  applyCamera(cameraAdapter, camera.getState());
  updateCameraStatus(ui, camera.getState());
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
    if (applySandboxCameraAction(camera, event)) {
      applyCamera(cameraAdapter, camera.getState());
      updateCameraStatus(ui, camera.getState());
    }
    sandbox.runtime.eventBus.emit(
      "input.action",
      {
        actionId: event.actionId,
        contextId: event.contextId,
        phase: event.phase,
        value: event.value
      },
      "sandbox.input"
    );
    updateInputStatus(ui, {
      action: event.actionId,
      context: event.contextId
    });
  });
  const inputAdapter = createDomInputAdapter({
    target: window,
    scope: (event) => {
      if (isPointerLikeInput(event)) {
        activeInputScope = isEventInElement(event, ui.rendererRoot) ? "game" : "ui";
        if (activeInputScope === "game" && event.type === "pointerdown") {
          ui.rendererRoot.focus({ preventScroll: true });
        }
      }

      return activeInputScope;
    },
    onInput: (event) => {
      inputRouter.handle(event);
    }
  });
  inputAdapter.start();

  await platform.services.storage.setItem("sandbox.platform", "ready");
  updatePlatformStatus(ui, {
    id: platform.id,
    storage: (await platform.services.storage.getItem("sandbox.platform")) ?? "unavailable",
    fs:
      (await platform.services.permissions.query("fs.write")) === "granted"
        ? "memory"
        : "unavailable"
  });
  sandbox.runtime.start();

  let lastTime: number | undefined;

  function frame(now: number) {
    const delta = lastTime === undefined ? 0 : Math.max(0, Math.min(now - lastTime, 64));
    lastTime = now;
    sandbox.runtime.tick(delta);
    updateSandboxHud(ui, sandbox);
    updateAssetStatus(ui, assetManager);
    requestAnimationFrame(frame);
  }

  updateSandboxHud(ui, sandbox);
  requestAnimationFrame(frame);
}

function createCameraAdapter(
  runtime: PhaserRendererDriverRuntime | undefined
): PhaserCameraAdapter | undefined {
  if (!runtime?.camera) {
    return undefined;
  }

  return createPhaserCameraAdapter({
    driver: runtime.camera
  });
}

function requirePhaserAssetRuntime(
  runtime: PhaserRendererDriverRuntime | undefined
): PhaserRendererAssetRuntime {
  if (!runtime?.assets) {
    throw new Error("Phaser renderer asset runtime is unavailable");
  }

  return runtime.assets;
}

function applyCamera(adapter: PhaserCameraAdapter | undefined, state: CameraState2D): void {
  adapter?.applyCameraState(state);
}

function keyboardPanBindings(code: string): InputBinding[] {
  return [
    { device: "keyboard", code, phase: "pressed" },
    { device: "keyboard", code, phase: "held" }
  ];
}

type SandboxInputScope = "game" | "ui";

function isPointerLikeInput(event: Event): boolean {
  return event.type.startsWith("pointer") || event.type === "wheel";
}

function isEventInElement(event: Event, element: Element): boolean {
  return event.target instanceof Node && element.contains(event.target);
}
