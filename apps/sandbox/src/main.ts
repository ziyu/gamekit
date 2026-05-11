import "./styles.css";
import { createWebPlatform } from "@gamekit/platform-web";
import { createPhaserRenderer } from "@gamekit/renderer-phaser";
import { createSandboxRuntime, SANDBOX_RENDER_SIZE } from "./game";
import { renderSandboxShell, updatePlatformStatus, updateSandboxHud } from "./ui/render-sandbox";

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

  await renderer.boot({
    container: ui.rendererRoot,
    width: SANDBOX_RENDER_SIZE.width,
    height: SANDBOX_RENDER_SIZE.height,
    onDiagnostic: (event) => {
      sandbox.runtime.eventBus.emit(event.type, event.payload, event.source);
    },
    debug: true
  });
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
