import "@gamekit/react-ui/styles.css";
import "./ui/theme.css";
import "./styles.css";
import { createConfiguredAppHost } from "@gamekit/app-host";
import type { NormalizedInputEvent } from "@gamekit/input-core";
import { createUiRuntime } from "@gamekit/ui-core";
import {
  routeSandboxSceneOverlayInput,
  SANDBOX_SCENE_CLICK_ACTION_ID,
  toRendererLocalInput
} from "./app-input";
import { sandboxAppDefinition } from "./app-definition";
import { createSandboxWebProfile, type SandboxAppContext } from "./app-profile";
import { resolveSandboxSceneClickTarget } from "./scene-hit-test";
import {
  applySandboxSceneClickSelection,
  bindSandboxWorkbenchControls,
  createSandboxWorkbenchState,
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
  const uiRuntime = createUiRuntime();
  const ui = renderSandboxShell(root, uiRuntime);
  const workbench = createSandboxWorkbenchState();
  const context: SandboxAppContext = {
    ui,
    uiRuntime,
    activeInputScope: "ui"
  };
  uiRuntime.subscribe(() => {
    const scope = uiRuntime.focus().scope;
    context.activeInputScope = scope === "game" ? "game" : "ui";
  });
  const refreshWorkbench = () => {
    if (context.sandbox) {
      updateSandboxHud(ui, context.sandbox, workbench, {
        forceSnapshot: true,
        forceWorkbench: true
      });
    }
  };

  bindSandboxWorkbenchControls(ui, workbench, {
    onChange: refreshWorkbench,
    onFollowEntity(entityId) {
      context.sandbox?.runtime.eventBus.emit(
        "camera.follow_entity",
        { entityId },
        "sandbox.inspector"
      );
    },
    onStopFollow() {
      context.sandbox?.runtime.eventBus.emit("camera.stop_follow", {}, "sandbox.inspector");
    },
    onSceneOverlayInput(event) {
      routeSandboxSceneOverlayInput(context, event);
    }
  });

  const configured = createConfiguredAppHost({
    app: sandboxAppDefinition,
    profile: createSandboxWebProfile(),
    context
  });
  const { host } = configured;
  const unsubscribeScenePick = requireSandboxContext(context.inputRouter, "inputRouter").onAction(
    (event) => {
      if (event.actionId !== SANDBOX_SCENE_CLICK_ACTION_ID || event.phase !== "released") {
        return;
      }
      const input = toRendererLocalInput(context, event.input);
      applySandboxSceneClickSelection(ui, workbench, resolveSceneClickSelection(context, input));
      refreshWorkbench();
    }
  );

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
    host.tick(delta, now);
    updateSandboxHud(ui, sandbox, workbench);
    updateAssetStatus(ui, assetManager);
    updateHostStatus(ui, host);
    requestAnimationFrame(frame);
  }

  updateSandboxHud(ui, requireSandboxContext(context.sandbox, "sandbox"), workbench);
  requestAnimationFrame(frame);
  window.addEventListener("beforeunload", unsubscribeScenePick, { once: true });
}

function requireSandboxContext<TValue>(value: TValue | undefined, name: string): TValue {
  if (value === undefined) {
    throw new Error(`Missing sandbox app context value: ${name}`);
  }

  return value;
}

function resolveSceneClickSelection(
  context: SandboxAppContext,
  input: NormalizedInputEvent
): { entityId: string | number; actorId?: string } | undefined {
  const sandbox = context.sandbox;
  const camera = context.cameraController;
  if (!sandbox || !camera || input.x === undefined || input.y === undefined) {
    return undefined;
  }

  const cameraState = context.ui.latestCameraStatus ?? context.cameraController?.getState();
  if (!cameraState) {
    return undefined;
  }
  return resolveSandboxSceneClickTarget(
    sandbox.snapshot(),
    { x: input.x, y: input.y },
    cameraState
  );
}
