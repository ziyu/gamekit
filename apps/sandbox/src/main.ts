import "./styles.css";
import { createSandboxRuntime } from "./game";
import { renderSandbox } from "./ui/render-sandbox";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;
const sandbox = createSandboxRuntime();
sandbox.runtime.start();

let lastTime = performance.now();

function frame(now: number) {
  const delta = Math.min(now - lastTime, 64);
  lastTime = now;
  sandbox.runtime.tick(delta);
  renderSandbox(appElement, sandbox);
  requestAnimationFrame(frame);
}

renderSandbox(appElement, sandbox);
requestAnimationFrame(frame);
