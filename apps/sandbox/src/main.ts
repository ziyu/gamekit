import "./styles.css";
import { createConfiguredAppHost } from "@gamekit/app-host";
import { sandboxAppDefinition } from "./app-definition";
import { createSandboxWebProfile, type SandboxAppContext } from "./app-profile";
import {
  renderSandboxShell,
  updateAssetStatus,
  updateDataStatus,
  updateHostStatus,
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
  const context: SandboxAppContext = {
    ui,
    activeInputScope: "ui"
  };
  const configured = createConfiguredAppHost({
    app: sandboxAppDefinition,
    profile: createSandboxWebProfile(),
    context
  });
  const { host } = configured;

  updateHostStatus(ui, host);
  await host.boot();
  updateHostStatus(ui, host);
  updateDataStatus(ui, requireSandboxContext(context.dataRegistry, "dataRegistry"));
  updateAssetStatus(ui, requireSandboxContext(context.assetManager, "assetManager"));

  const platform = requireSandboxContext(context.platform, "platform");
  await platform.services.storage.setItem("sandbox.platform", "ready");
  updatePlatformStatus(ui, {
    id: platform.id,
    storage: (await platform.services.storage.getItem("sandbox.platform")) ?? "unavailable",
    fs:
      (await platform.services.permissions.query("fs.write")) === "granted"
        ? "memory"
        : "unavailable"
  });
  await host.start();
  updateHostStatus(ui, host);

  let lastTime: number | undefined;

  function frame(now: number) {
    const sandbox = requireSandboxContext(context.sandbox, "sandbox");
    const assetManager = requireSandboxContext(context.assetManager, "assetManager");
    const delta = lastTime === undefined ? 0 : Math.max(0, Math.min(now - lastTime, 64));
    lastTime = now;
    sandbox.runtime.tick(delta);
    updateSandboxHud(ui, sandbox);
    updateAssetStatus(ui, assetManager);
    updateHostStatus(ui, host);
    requestAnimationFrame(frame);
  }

  updateSandboxHud(ui, requireSandboxContext(context.sandbox, "sandbox"));
  requestAnimationFrame(frame);
}

function requireSandboxContext<TValue>(value: TValue | undefined, name: string): TValue {
  if (value === undefined) {
    throw new Error(`Missing sandbox app context value: ${name}`);
  }

  return value;
}
