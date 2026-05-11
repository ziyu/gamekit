import "./styles.css";
import { createPhaserRenderer } from "@gamekit/renderer-phaser";
import { createSandboxRuntime, SANDBOX_RENDER_SIZE } from "./game";
import { renderSandboxShell, updateSandboxHud } from "./ui/render-sandbox";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;
void bootSandbox(appElement);

async function bootSandbox(root: HTMLElement): Promise<void> {
  const ui = renderSandboxShell(root);
  const renderer = createPhaserRenderer();
  const sandbox = createSandboxRuntime({
    renderer,
    renderSize: SANDBOX_RENDER_SIZE
  });

  await renderer.boot({
    container: ui.rendererRoot,
    width: SANDBOX_RENDER_SIZE.width,
    height: SANDBOX_RENDER_SIZE.height,
    eventBus: sandbox.runtime.eventBus,
    debug: true
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
