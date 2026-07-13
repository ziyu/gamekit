import "@gamekit/devtools-ui/styles.css";
import "./styles.css";
import { createConfiguredAppHost } from "@gamekit/app-host";
import type { InputActionEvent } from "@gamekit/input-core";
import { createUiRuntime } from "@gamekit/ui-core";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { outpostAppDefinition } from "./app-definition";
import { applyOutpostInputAction, OUTPOST_ACTION } from "./gameplay";
import { createOutpostBrowserProfile, type OutpostBrowserContext } from "./profiles";
import { OutpostApp, type OutpostBootPhase } from "./ui";

const rootElement = document.querySelector<HTMLElement>("#app");
if (!rootElement) {
  throw new Error("Missing #app element");
}

void boot(rootElement);

async function boot(root: HTMLElement): Promise<void> {
  const reactRoot = createRoot(root);
  const rendererRoot = document.createElement("div");
  rendererRoot.className = "outpost-renderer";
  const uiRuntime = createUiRuntime();
  let phase: OutpostBootPhase = "initializing";
  let message = "initializing Rapier 2D";
  let context: OutpostBrowserContext | undefined;

  const render = (sync = false) => {
    const element = (
      <OutpostApp
        bootMessage={message}
        bootPhase={phase}
        devtools={context?.devtools}
        onGameFocus={() => {
          if (context) {
            context.inputBlocked = false;
          }
          uiRuntime.setFocus({ scope: "game", reason: "outpost.viewport" });
        }}
        rendererRoot={rendererRoot}
        uiRuntime={uiRuntime}
      />
    );
    if (sync) {
      flushSync(() => reactRoot.render(element));
    } else {
      reactRoot.render(element);
    }
  };

  render(true);
  try {
    const { initRapier2dPhysicsBackend } = await import("@gamekit/physics-rapier2d");
    const physicsBackend = await initRapier2dPhysicsBackend({
      id: "outpost.preview.rapier2d",
      lengthUnit: 100
    });
    context = {
      ui: { rendererRoot },
      uiRuntime,
      physicsBackend,
      inputBlocked: false,
      assetDiagnostics: []
    };
    phase = "booting";
    message = "booting App Host service graph";
    render();
    await waitForRendererRoot(rendererRoot);

    const configured = createConfiguredAppHost({
      app: outpostAppDefinition,
      profile: createOutpostBrowserProfile(context),
      context
    });
    const host = configured.host;
    await host.boot();
    if (!context.preview || !context.inputRouter || !context.multiplayer) {
      throw new Error("Outpost browser profile did not expose required runtime services");
    }
    const activeContext = context;
    const multiplayer = requireExposed(activeContext.multiplayer, "multiplayer");
    const inputRouter = requireExposed(activeContext.inputRouter, "input router");
    await multiplayer.createSession({
      id: "outpost.preview.session",
      kind: "local",
      authority: "local"
    });
    const unsubscribeInput = inputRouter.onAction((event) =>
      routeInputAction(activeContext, event)
    );
    await host.start();
    phase = "running";
    message = "local physical preview online";
    render();

    let lastTime: number | undefined;
    let frameHandle = 0;
    const frame = (now: number) => {
      const delta = lastTime === undefined ? 0 : Math.max(0, Math.min(48, now - lastTime));
      lastTime = now;
      host.tick(delta, now);
      frameHandle = requestAnimationFrame(frame);
    };
    frameHandle = requestAnimationFrame(frame);

    window.addEventListener(
      "beforeunload",
      () => {
        cancelAnimationFrame(frameHandle);
        unsubscribeInput();
        void host.dispose();
      },
      { once: true }
    );
  } catch (error) {
    phase = "failed";
    message = error instanceof Error ? error.message : String(error);
    render();
    console.error(error);
  }
}

function routeInputAction(context: OutpostBrowserContext, event: InputActionEvent): void {
  const preview = context.preview;
  if (!preview) {
    return;
  }
  if (
    event.actionId === OUTPOST_ACTION.aim &&
    event.input.x !== undefined &&
    event.input.y !== undefined
  ) {
    const world = preview.screenToWorld({ x: event.input.x, y: event.input.y });
    applyOutpostInputAction(preview.input, {
      ...event,
      input: { ...event.input, x: world.x, y: world.y }
    });
    return;
  }
  applyOutpostInputAction(preview.input, event);
}

async function waitForRendererRoot(rendererRoot: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (rendererRoot.isConnected) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  throw new Error("Outpost renderer root was not mounted");
}

function requireExposed<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Outpost browser profile did not expose ${label}`);
  }
  return value;
}
