import type { SandboxUiHandles, SandboxWorkbenchState } from "./types";

export function createSandboxWorkbenchState(): SandboxWorkbenchState {
  return {
    activeInspectorTab: "actor",
    timelineFilter: "all"
  };
}

export function renderSandboxShell(appElement: HTMLElement): SandboxUiHandles {
  appElement.innerHTML = `
    <section class="workbench">
      <header class="topbar">
        <div>
          <p class="eyebrow">GameKit / Scene Workbench</p>
          <h1>Signal Outpost</h1>
        </div>
        <div class="status" data-ui="status"><span></span>stopped</div>
      </header>

      <main class="workspace">
        <section class="scene-column">
          <article class="stage-panel">
            <div class="stage-panel__bar">
              <div>
                <span class="label">Objective</span>
                <strong data-ui="objective-label">Signal Outpost</strong>
              </div>
              <div class="objective-state">
                <span data-ui="objective-status">waiting</span>
                <strong data-ui="objective-progress">0%</strong>
              </div>
            </div>
            <div class="objective-meter"><span data-ui="objective-progress-bar"></span></div>
            <p class="objective-detail" data-ui="objective-detail">Waiting for runtime.</p>
            <div class="stage">
              <div class="renderer-root" data-ui="renderer-root" tabindex="0"></div>
              <div class="stage-hint">
                <span>WASD camera</span>
                <span>Confirm triggers GAS</span>
                <span data-ui="entity-count">0</span>
              </div>
            </div>
          </article>

          <section class="signal-strip">
            <div><span>Tick</span><strong data-ui="tick">0</strong></div>
            <div><span>Modules</span><strong data-ui="modules">0</strong></div>
            <div><span>Systems</span><strong data-ui="systems">0</strong></div>
            <div><span>Input</span><strong data-ui="input-action">waiting</strong></div>
            <div><span>Scope</span><strong data-ui="input-context">global</strong></div>
            <div><span>Camera</span><strong data-ui="camera-position">0, 0</strong></div>
            <div><span>Zoom</span><strong data-ui="camera-zoom">1.00</strong></div>
            <div><span>Mode</span><strong data-ui="camera-mode">free</strong></div>
          </section>
        </section>

        <aside class="inspector">
          <div class="inspector__header">
            <div>
              <span class="label">Selected Actor</span>
              <strong data-ui="selected-actor">none</strong>
            </div>
          </div>
          <div class="tabs" role="tablist">
            <button type="button" data-inspector-tab="actor">Actor</button>
            <button type="button" data-inspector-tab="runtime">Runtime</button>
            <button type="button" data-inspector-tab="content">Content</button>
            <button type="button" data-inspector-tab="rules">Rules</button>
            <button type="button" data-inspector-tab="host">Host</button>
          </div>
          <div class="inspector__body" data-ui="inspector-body"></div>
        </aside>
      </main>

      <section class="timeline-panel">
        <div class="timeline-panel__header">
          <div>
            <span class="label">Cross-module Timeline</span>
            <strong>input → TCA → GAS → cue</strong>
          </div>
          <div class="timeline-filters">
            <button type="button" data-timeline-filter="all">All</button>
            <button type="button" data-timeline-filter="input">Input</button>
            <button type="button" data-timeline-filter="tca">TCA</button>
            <button type="button" data-timeline-filter="gas">GAS</button>
            <button type="button" data-timeline-filter="renderer">Renderer</button>
            <button type="button" data-timeline-filter="runtime">Runtime</button>
          </div>
        </div>
        <ol class="timeline" data-ui="timeline-list"></ol>
      </section>
    </section>
  `;

  return {
    root: appElement,
    rendererRoot: readElement(appElement, "renderer-root", HTMLDivElement),
    status: readElement(appElement, "status", HTMLDivElement),
    objectiveLabel: readElement(appElement, "objective-label", HTMLElement),
    objectiveStatus: readElement(appElement, "objective-status", HTMLElement),
    objectiveProgress: readElement(appElement, "objective-progress", HTMLElement),
    objectiveProgressBar: readElement(appElement, "objective-progress-bar", HTMLElement),
    objectiveDetail: readElement(appElement, "objective-detail", HTMLElement),
    entityCount: readElement(appElement, "entity-count", HTMLElement),
    tick: readElement(appElement, "tick", HTMLElement),
    modules: readElement(appElement, "modules", HTMLElement),
    systems: readElement(appElement, "systems", HTMLElement),
    inputAction: readElement(appElement, "input-action", HTMLElement),
    inputContext: readElement(appElement, "input-context", HTMLElement),
    cameraPosition: readElement(appElement, "camera-position", HTMLElement),
    cameraZoom: readElement(appElement, "camera-zoom", HTMLElement),
    cameraMode: readElement(appElement, "camera-mode", HTMLElement),
    selectedActor: readElement(appElement, "selected-actor", HTMLElement),
    inspectorTabs: [...appElement.querySelectorAll<HTMLButtonElement>("[data-inspector-tab]")],
    inspectorBody: readElement(appElement, "inspector-body", HTMLElement),
    timelineFilters: [...appElement.querySelectorAll<HTMLButtonElement>("[data-timeline-filter]")],
    timelineList: readElement(appElement, "timeline-list", HTMLElement)
  };
}

export function bindSandboxWorkbenchControls(
  handles: SandboxUiHandles,
  state: SandboxWorkbenchState,
  actions: {
    onChange: () => void;
    onScenePick?(event: PointerEvent): { entityId: string | number; actorId?: string } | undefined;
    onFollowEntity?(entityId: string | number): void;
    onStopFollow?(): void;
  }
): void {
  for (const tab of handles.inspectorTabs) {
    tab.addEventListener("click", () => {
      state.activeInspectorTab = tab.dataset
        .inspectorTab as SandboxWorkbenchState["activeInspectorTab"];
      handles.lastWorkbenchRenderAt = undefined;
      actions.onChange();
    });
  }

  for (const filter of handles.timelineFilters) {
    filter.addEventListener("click", () => {
      state.timelineFilter = filter.dataset
        .timelineFilter as SandboxWorkbenchState["timelineFilter"];
      handles.lastWorkbenchRenderAt = undefined;
      actions.onChange();
    });
  }

  handles.rendererRoot.addEventListener("pointerdown", (event) => {
    const selected = actions.onScenePick?.(event);
    if (!selected) {
      return;
    }
    state.selectedEntityId = selected.entityId;
    state.selectedActorId = selected.actorId;
    state.activeInspectorTab = "actor";
    handles.lastWorkbenchRenderAt = undefined;
    actions.onChange();
  });

  handles.inspectorBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actorButton = target.closest<HTMLButtonElement>("[data-select-actor]");
    if (actorButton) {
      state.selectedActorId = actorButton.dataset.selectActor;
      state.selectedEntityId = readEntityDataset(actorButton.dataset.selectEntity);
      state.activeInspectorTab = "actor";
      handles.lastWorkbenchRenderAt = undefined;
      actions.onChange();
      return;
    }

    const entityButton = target.closest<HTMLButtonElement>("[data-select-entity]");
    if (entityButton) {
      state.selectedEntityId = readEntityDataset(entityButton.dataset.selectEntity);
      state.selectedActorId = entityButton.dataset.selectActor;
      state.activeInspectorTab = "actor";
      handles.lastWorkbenchRenderAt = undefined;
      actions.onChange();
      return;
    }

    const followButton = target.closest<HTMLButtonElement>("[data-camera-follow]");
    if (followButton) {
      const entityId = readEntityDataset(followButton.dataset.cameraFollow);
      if (entityId !== undefined) {
        state.followedEntityId = entityId;
        actions.onFollowEntity?.(entityId);
        handles.lastWorkbenchRenderAt = undefined;
        actions.onChange();
      }
      return;
    }

    const stopFollowButton = target.closest<HTMLButtonElement>("[data-camera-stop-follow]");
    if (stopFollowButton) {
      state.followedEntityId = undefined;
      actions.onStopFollow?.();
      handles.lastWorkbenchRenderAt = undefined;
      actions.onChange();
    }
  });
}

function readEntityDataset(value: string | undefined): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && String(numeric) === value ? numeric : value;
}

function readElement<T extends Element>(root: Element, key: string, elementType: { new (): T }): T {
  const element = root.querySelector(`[data-ui="${key}"]`);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing sandbox UI element: ${key}`);
  }

  return element;
}
