import "./styles.css";
import { createConfiguredAppHost } from "@gamekit/app-host";
import type { ThreeRendererNative } from "@gamekit/driver-three";
import { initRapier3dPhysicsBackend } from "@gamekit/physics-rapier3d";
import { physics3dLabAppDefinition } from "./app-definition";
import {
  createPhysics3dLabProfile,
  measureViewport,
  type Physics3dLabAppContext
} from "./app-profile";
import { createPhysics3dFreeCamera } from "./physics-3d-free-camera";
import { PHYSICS_3D_GROUPS, createPhysics3dLab, type Physics3dLabSnapshot } from "./physics-3d-lab";
import { createPhysics3dLabVisual, screenToPhysicsQueryPoint } from "./physics-3d-visual";
import {
  bindPhysics3dLabUi,
  renderPhysics3dLabShell,
  setPhysics3dLabLoading,
  updatePhysics3dLabUi
} from "./ui";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app element");
}

void boot(root).catch((error) => {
  root.replaceChildren();
  const message = document.createElement("pre");
  message.className = "physics-3d-lab__boot-error";
  message.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
  root.append(message);
});

async function boot(rootElement: HTMLElement): Promise<void> {
  const ui = renderPhysics3dLabShell(rootElement);
  const context: Physics3dLabAppContext = { ui };
  setPhysics3dLabLoading(ui, {
    visible: true,
    title: "Booting App Host",
    detail: "Registering Web platform and Three driver"
  });
  const configured = createConfiguredAppHost({
    app: physics3dLabAppDefinition,
    profile: createPhysics3dLabProfile(),
    context
  });
  await configured.host.boot();
  await configured.host.start();

  setPhysics3dLabLoading(ui, {
    visible: true,
    title: "Initializing Rapier3D",
    detail: "Preparing physics scene and debug mesh layer"
  });
  const backend = await initRapier3dPhysicsBackend({
    id: "physics-3d-lab.rapier3d",
    groups: PHYSICS_3D_GROUPS
  });
  const renderer = requireContext(context.renderer, "renderer");
  const lab = createPhysics3dLab(backend);
  const threeNative = renderer.native() as ThreeRendererNative;
  const visual = createPhysics3dLabVisual(threeNative);
  let snapshot = lab.snapshot();
  const freeCamera = createPhysics3dFreeCamera(threeNative, ui.viewport, {
    enabled: () => snapshot.cameraPreset === "free"
  });
  const commitSnapshot = (
    nextSnapshot: Physics3dLabSnapshot,
    options: { updateUi?: boolean | undefined } = {}
  ): void => {
    snapshot = nextSnapshot;
    if (snapshot.cameraPreset === "free") {
      freeCamera.apply();
    }
    visual.update(snapshot);
    if (options.updateUi !== false) {
      updatePhysics3dLabUi(ui, snapshot);
    }
  };
  bindPhysics3dLabUi(ui, lab, commitSnapshot);
  commitSnapshot(snapshot);
  setPhysics3dLabLoading(ui, { visible: false });
  ui.pushDiagnostic("physics scene ready");

  const resizeObserver = new ResizeObserver(() => {
    const size = measureViewport(ui.viewport);
    renderer.resize(size.width, size.height);
  });
  resizeObserver.observe(ui.viewport);
  const updateQueryFromPointer = (event: PointerEvent): void => {
    if (freeCamera.isDragging()) {
      return;
    }
    const point = screenToPhysicsQueryPoint(
      threeNative,
      ui.viewport.getBoundingClientRect(),
      event.clientX,
      event.clientY
    );
    if (point) {
      commitSnapshot(lab.setQueryPoint(point), { updateUi: false });
    }
  };
  ui.viewport.addEventListener("pointermove", updateQueryFromPointer);

  let lastTime: number | undefined;
  let lastUiUpdate = 0;
  let frameHandle = 0;
  const frame = (now: number): void => {
    const delta = lastTime === undefined ? 1000 / 60 : now - lastTime;
    lastTime = now;
    configured.host.tick(delta, now);
    commitSnapshot(lab.step(delta), { updateUi: false });
    if (now - lastUiUpdate > 120) {
      updatePhysics3dLabUi(ui, snapshot);
      lastUiUpdate = now;
    }
    frameHandle = requestAnimationFrame(frame);
  };
  frameHandle = requestAnimationFrame(frame);

  window.addEventListener(
    "beforeunload",
    () => {
      cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      ui.viewport.removeEventListener("pointermove", updateQueryFromPointer);
      freeCamera.destroy();
      visual.destroy();
      lab.dispose();
      void configured.host.dispose();
    },
    { once: true }
  );
}

function requireContext<TValue>(value: TValue | undefined, name: string): TValue {
  if (value === undefined) {
    throw new Error(`Missing Physics 3D Lab context value: ${name}`);
  }
  return value;
}
