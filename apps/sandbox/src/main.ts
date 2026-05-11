import "./styles.css";
import { createInputRouter } from "@gamekit/input-core";
import { createDomInputAdapter } from "@gamekit/input-dom";
import { createWebPlatform } from "@gamekit/platform-web";
import { createPhaserRenderer } from "@gamekit/renderer-phaser";
import { createSandboxRuntime, SANDBOX_RENDER_SIZE } from "./game";
import {
  renderSandboxShell,
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
  const platform = createWebPlatform({ appName: "GameKit Sandbox" });
  const renderer = createPhaserRenderer();
  const sandbox = createSandboxRuntime({
    renderer,
    renderSize: SANDBOX_RENDER_SIZE
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
  inputRouter.registerAction({
    id: "camera.pan_up",
    name: "Pan Up",
    category: "camera",
    defaultBindings: [{ device: "keyboard", code: "KeyW", phase: "pressed" }]
  });
  inputRouter.registerAction({
    id: "camera.pan_down",
    name: "Pan Down",
    category: "camera",
    defaultBindings: [{ device: "keyboard", code: "KeyS", phase: "pressed" }]
  });
  inputRouter.registerAction({
    id: "camera.zoom_in",
    name: "Zoom In",
    category: "camera",
    defaultBindings: [{ device: "mouse", phase: "scrolled" }]
  });
  inputRouter.registerAction({
    id: "game.confirm",
    name: "Confirm",
    category: "gameplay",
    defaultBindings: [{ device: "keyboard", code: "Enter", phase: "pressed" }]
  });
  inputRouter.addContext({
    id: "camera",
    priority: 10,
    actionIds: ["camera.pan_up", "camera.pan_down", "camera.zoom_in"],
    capture: false
  });
  inputRouter.addContext({
    id: "gameplay",
    priority: 5,
    actionIds: ["game.confirm"]
  });
  inputRouter.onAction((event) => {
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
    requestAnimationFrame(frame);
  }

  updateSandboxHud(ui, sandbox);
  requestAnimationFrame(frame);
}
