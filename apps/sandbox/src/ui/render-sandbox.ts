import type { AssetManager } from "@gamekit/asset";
import type { DataRegistry } from "@gamekit/data";
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
  modules: HTMLElement;
  entityList: HTMLElement;
  dataPacks: HTMLElement;
  dataKinds: HTMLElement;
  dataDocuments: HTMLElement;
  dataReferences: HTMLElement;
  dataList: HTMLElement;
  assetLoaded: HTMLElement;
  assetRegistered: HTMLElement;
  assetFailed: HTMLElement;
  assetList: HTMLElement;
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
            <div><dt>Modules</dt><dd data-ui="modules">0</dd></div>
          </dl>
        </article>

        <article class="panel panel--world">
          <div class="panel__title">
            <span>World</span>
            <strong>entities</strong>
          </div>
          <ol class="compact-list" data-ui="entity-list"></ol>
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

        <article class="panel">
          <div class="panel__title">
            <span>Data</span>
            <strong><span data-ui="data-documents">0</span> docs</strong>
          </div>
          <dl class="metrics metrics--compact">
            <div><dt>Packs</dt><dd data-ui="data-packs">0</dd></div>
            <div><dt>Kinds</dt><dd data-ui="data-kinds">0</dd></div>
            <div><dt>Refs</dt><dd data-ui="data-references">0</dd></div>
          </dl>
          <ol class="compact-list" data-ui="data-list"></ol>
        </article>

        <article class="panel">
          <div class="panel__title">
            <span>Assets</span>
            <strong><span data-ui="asset-loaded">0</span> loaded</strong>
          </div>
          <dl class="metrics metrics--compact">
            <div><dt>Registered</dt><dd data-ui="asset-registered">0</dd></div>
            <div><dt>Failed</dt><dd data-ui="asset-failed">0</dd></div>
          </dl>
          <ol class="compact-list" data-ui="asset-list"></ol>
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
    modules: readElement(appElement, "modules", HTMLElement),
    entityList: readElement(appElement, "entity-list", HTMLElement),
    dataPacks: readElement(appElement, "data-packs", HTMLElement),
    dataKinds: readElement(appElement, "data-kinds", HTMLElement),
    dataDocuments: readElement(appElement, "data-documents", HTMLElement),
    dataReferences: readElement(appElement, "data-references", HTMLElement),
    dataList: readElement(appElement, "data-list", HTMLElement),
    assetLoaded: readElement(appElement, "asset-loaded", HTMLElement),
    assetRegistered: readElement(appElement, "asset-registered", HTMLElement),
    assetFailed: readElement(appElement, "asset-failed", HTMLElement),
    assetList: readElement(appElement, "asset-list", HTMLElement),
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
  handles.modules.textContent = String(sandbox.runtime.modules.length);
  handles.entityList.innerHTML = state.entities
    .map(
      (entity) => `
      <li>
        <code>${escapeHtml(String(entity.id))}</code>
        <span>pos ${formatNumber(entity.x)}, ${formatNumber(entity.y)} · vel ${formatNumber(entity.vx)}, ${formatNumber(entity.vy)}</span>
      </li>
    `
    )
    .join("");
  handles.events.innerHTML = state.events
    .slice()
    .reverse()
    .map(
      (event) => `
      <li>
        <code>${escapeHtml(event.type)}</code>
        <span>${escapeHtml(event.source ?? "unknown")} · ${event.timestamp}</span>
      </li>
    `
    )
    .join("");
}

export function updateDataStatus(handles: SandboxUiHandles, registry: DataRegistry): void {
  const snapshot = registry.snapshot();
  handles.dataPacks.textContent = String(snapshot.packs.length);
  handles.dataKinds.textContent = String(snapshot.kinds.length);
  handles.dataDocuments.textContent = String(snapshot.documents.length);
  handles.dataReferences.textContent = String(snapshot.references.length);
  handles.dataList.innerHTML = snapshot.documents
    .slice(0, 12)
    .map(
      (document) => `
      <li>
        <code>${escapeHtml(document.kind)}:${escapeHtml(document.id)}</code>
        <span>${document.tags.map(escapeHtml).join(" · ") || "untagged"}</span>
      </li>
    `
    )
    .join("");
}

export function updateAssetStatus(handles: SandboxUiHandles, assetManager: AssetManager): void {
  const states = assetManager.states();
  const loaded = states.filter((state) => state.status === "loaded").length;
  const failed = states.filter((state) => state.status === "failed").length;

  handles.assetLoaded.textContent = String(loaded);
  handles.assetRegistered.textContent = String(states.length);
  handles.assetFailed.textContent = String(failed);
  handles.assetList.innerHTML = states
    .map((state) => {
      const asset = assetManager.get(state.id);

      return `
        <li>
          <code>${escapeHtml(state.id)}</code>
          <span>${escapeHtml(asset.type)} · ${escapeHtml(state.status)}</span>
        </li>
      `;
    })
    .join("");
}

function readElement<T extends Element>(root: Element, key: string, elementType: { new (): T }): T {
  const element = root.querySelector(`[data-ui="${key}"]`);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing sandbox UI element: ${key}`);
  }

  return element;
}

function formatNumber(value: number): string {
  return value.toFixed(1);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
