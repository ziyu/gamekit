import "./styles.css";
import { createConfiguredAppHost } from "@gamekit/app-host";
import { sandboxAppDefinition } from "./app-definition";
import { createSandboxWebProfile, type SandboxAppContext } from "./app-profile";
import { SANDBOX_RENDER_SIZE, type SandboxSnapshot } from "./game";
import {
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
  const ui = renderSandboxShell(root);
  const workbench = createSandboxWorkbenchState();
  const context: SandboxAppContext = {
    ui,
    activeInputScope: "ui"
  };
  const refreshWorkbench = () => {
    if (context.sandbox) {
      updateSandboxHud(ui, context.sandbox, workbench);
    }
  };

  bindSandboxWorkbenchControls(ui, workbench, {
    onChange: refreshWorkbench,
    onScenePick(event) {
      return pickSandboxEntity(context, event);
    },
    onFollowEntity(entityId) {
      context.sandbox?.runtime.eventBus.emit(
        "camera.follow_entity",
        { entityId },
        "sandbox.inspector"
      );
    },
    onStopFollow() {
      context.sandbox?.runtime.eventBus.emit("camera.stop_follow", {}, "sandbox.inspector");
    }
  });

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
    updateSandboxHud(ui, sandbox, workbench);
    updateAssetStatus(ui, assetManager);
    updateHostStatus(ui, host);
    requestAnimationFrame(frame);
  }

  updateSandboxHud(ui, requireSandboxContext(context.sandbox, "sandbox"), workbench);
  requestAnimationFrame(frame);
}

function requireSandboxContext<TValue>(value: TValue | undefined, name: string): TValue {
  if (value === undefined) {
    throw new Error(`Missing sandbox app context value: ${name}`);
  }

  return value;
}

function pickSandboxEntity(
  context: SandboxAppContext,
  event: PointerEvent
): { entityId: string | number; actorId?: string } | undefined {
  const sandbox = context.sandbox;
  const camera = context.cameraController;
  if (!sandbox || !camera) {
    return undefined;
  }

  const bounds = context.ui.rendererRoot.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return undefined;
  }

  const screen = {
    x: ((event.clientX - bounds.left) / bounds.width) * SANDBOX_RENDER_SIZE.width,
    y: ((event.clientY - bounds.top) / bounds.height) * SANDBOX_RENDER_SIZE.height
  };
  const world = camera.screenToWorld(screen);
  const picked = findNearestPickableEntity(sandbox.snapshot(), world);
  if (!picked) {
    return undefined;
  }

  return picked.actorId
    ? {
        entityId: picked.id,
        actorId: picked.actorId
      }
    : { entityId: picked.id };
}

function findNearestPickableEntity(
  snapshot: SandboxSnapshot,
  point: { x: number; y: number }
): SandboxSnapshot["entities"][number] | undefined {
  let best: { entity: SandboxSnapshot["entities"][number]; distance: number } | undefined;
  for (const entity of snapshot.entities) {
    if (entity.role === "signal-link") {
      continue;
    }

    const x = (entity.x / 100) * SANDBOX_RENDER_SIZE.width;
    const y = (entity.y / 100) * SANDBOX_RENDER_SIZE.height;
    const distance = Math.hypot(point.x - x, point.y - y);
    const radius = entity.role === "command-core" ? 42 : entity.role === "scout" ? 24 : 34;
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { entity, distance };
    }
  }
  return best?.entity;
}
