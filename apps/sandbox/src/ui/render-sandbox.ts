import type { SandboxRuntime } from "../game";

export type SandboxUiHandles = {
  rendererRoot: HTMLDivElement;
  status: HTMLDivElement;
  platformId: HTMLElement;
  platformStorage: HTMLElement;
  platformFs: HTMLElement;
  inputAction: HTMLElement;
  inputContext: HTMLElement;
  cameraPosition: HTMLElement;
  cameraZoom: HTMLElement;
  cameraMode: HTMLElement;
  entityCount: HTMLElement;
  tick: HTMLElement;
  elapsed: HTMLElement;
  delta: HTMLElement;
  systems: HTMLElement;
  events: HTMLOListElement;
};

export function renderSandboxShell(appElement: HTMLElement): SandboxUiHandles {
  appElement.innerHTML = `
    <section class="shell">
      <header class="masthead">
        <div>
          <p class="eyebrow">GameKit / renderer vertical slice</p>
          <h1>Sandbox Control Plane</h1>
        </div>
        <div class="status" data-ui="status">
          <span></span>
          stopped
        </div>
      </header>

      <section class="grid">
        <article class="panel panel--stage">
          <div class="panel__title">
            <span>Renderer</span>
            <strong><span data-ui="entity-count">0</span> entities</strong>
          </div>
          <div class="stage">
            <div class="renderer-root" data-ui="renderer-root" tabindex="0"></div>
          </div>
        </article>

        <article class="panel">
          <div class="panel__title">
            <span>Runtime</span>
            <strong>tick <span data-ui="tick">0</span></strong>
          </div>
          <dl class="metrics">
            <div><dt>Elapsed</dt><dd data-ui="elapsed">0.0 ms</dd></div>
            <div><dt>Delta</dt><dd data-ui="delta">0.0 ms</dd></div>
            <div><dt>Systems</dt><dd data-ui="systems">0</dd></div>
          </dl>
        </article>

        <article class="panel">
          <div class="panel__title">
            <span>Platform</span>
            <strong data-ui="platform-id">web</strong>
          </div>
          <dl class="metrics">
            <div><dt>Storage</dt><dd data-ui="platform-storage">checking</dd></div>
            <div><dt>FS</dt><dd data-ui="platform-fs">checking</dd></div>
          </dl>
        </article>

        <article class="panel">
          <div class="panel__title">
            <span>Input</span>
            <strong data-ui="input-action">waiting</strong>
          </div>
          <dl class="metrics">
            <div><dt>Context</dt><dd data-ui="input-context">global</dd></div>
            <div><dt>Source</dt><dd>DOM adapter</dd></div>
          </dl>
        </article>

        <article class="panel">
          <div class="panel__title">
            <span>Camera</span>
            <strong data-ui="camera-mode">free</strong>
          </div>
          <dl class="metrics">
            <div><dt>Position</dt><dd data-ui="camera-position">0, 0</dd></div>
            <div><dt>Zoom</dt><dd data-ui="camera-zoom">1.00</dd></div>
          </dl>
        </article>

        <article class="panel panel--events">
          <div class="panel__title">
            <span>EventBus</span>
            <strong>recent</strong>
          </div>
          <ol class="events" data-ui="events"></ol>
        </article>
      </section>
    </section>
  `;

  return {
    rendererRoot: readElement(appElement, "renderer-root", HTMLDivElement),
    status: readElement(appElement, "status", HTMLDivElement),
    platformId: readElement(appElement, "platform-id", HTMLElement),
    platformStorage: readElement(appElement, "platform-storage", HTMLElement),
    platformFs: readElement(appElement, "platform-fs", HTMLElement),
    inputAction: readElement(appElement, "input-action", HTMLElement),
    inputContext: readElement(appElement, "input-context", HTMLElement),
    cameraPosition: readElement(appElement, "camera-position", HTMLElement),
    cameraZoom: readElement(appElement, "camera-zoom", HTMLElement),
    cameraMode: readElement(appElement, "camera-mode", HTMLElement),
    entityCount: readElement(appElement, "entity-count", HTMLElement),
    tick: readElement(appElement, "tick", HTMLElement),
    elapsed: readElement(appElement, "elapsed", HTMLElement),
    delta: readElement(appElement, "delta", HTMLElement),
    systems: readElement(appElement, "systems", HTMLElement),
    events: readElement(appElement, "events", HTMLOListElement)
  };
}

export type SandboxCameraStatus = {
  x: number;
  y: number;
  zoom: number;
  mode: string;
};

export function updateCameraStatus(handles: SandboxUiHandles, status: SandboxCameraStatus): void {
  handles.cameraPosition.textContent = `${status.x.toFixed(1)}, ${status.y.toFixed(1)}`;
  handles.cameraZoom.textContent = status.zoom.toFixed(2);
  handles.cameraMode.textContent = status.mode;
}

export type SandboxInputStatus = {
  action: string;
  context: string;
};

export function updateInputStatus(handles: SandboxUiHandles, status: SandboxInputStatus): void {
  handles.inputAction.textContent = status.action;
  handles.inputContext.textContent = status.context;
}

export type SandboxPlatformStatus = {
  id: string;
  storage: string;
  fs: string;
};

export function updatePlatformStatus(
  handles: SandboxUiHandles,
  status: SandboxPlatformStatus
): void {
  handles.platformId.textContent = status.id;
  handles.platformStorage.textContent = status.storage;
  handles.platformFs.textContent = status.fs;
}

export function updateSandboxHud(handles: SandboxUiHandles, sandbox: SandboxRuntime): void {
  const state = sandbox.snapshot();
  const clock = state.clock;

  handles.status.classList.toggle("status--running", state.running);
  handles.status.lastChild!.textContent = state.running ? " running" : " stopped";
  handles.entityCount.textContent = String(state.entityCount);
  handles.tick.textContent = String(clock.ticks);
  handles.elapsed.textContent = `${clock.elapsed.toFixed(1)} ms`;
  handles.delta.textContent = `${clock.delta.toFixed(1)} ms`;
  handles.systems.textContent = String(sandbox.runtime.systems.values().length);
  handles.events.innerHTML = state.events
    .slice()
    .reverse()
    .map(
      (event) => `
      <li>
        <code>${event.type}</code>
        <span>${event.source ?? "unknown"} · ${event.timestamp}</span>
      </li>
    `
    )
    .join("");
}

function readElement<T extends Element>(root: Element, key: string, elementType: { new (): T }): T {
  const element = root.querySelector(`[data-ui="${key}"]`);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing sandbox UI element: ${key}`);
  }

  return element;
}
