import type { AssetManager } from "@gamekit/asset";
import type { AppHost } from "@gamekit/app-host";
import type { DataRegistry } from "@gamekit/data";
import type { SandboxRuntime } from "../game";
import { formatNumber, formatPercent } from "./format";
import { renderInspector } from "./inspector";
import { renderSceneOverlay } from "./scene-overlay";
import { renderTimeline } from "./timeline";
import type {
  SandboxCameraStatus,
  SandboxInputStatus,
  SandboxPlatformStatus,
  SandboxUiHandles,
  SandboxWorkbenchState
} from "./types";

export function updateSandboxHud(
  handles: SandboxUiHandles,
  sandbox: SandboxRuntime,
  state: SandboxWorkbenchState
): void {
  handles.latestSandbox = sandbox;
  handles.latestWorkbenchState = { ...state };
  const selectionCleared = state.selectionCleared === true;
  const snapshot = sandbox.snapshot({
    selectedActorId: selectionCleared ? undefined : state.selectedActorId,
    selectedEntityId: selectionCleared ? undefined : state.selectedEntityId,
    defaultSelection: !selectionCleared
  });
  const clock = snapshot.clock;

  handles.status.classList.toggle("status--running", snapshot.running);
  handles.status.lastChild!.textContent = snapshot.running ? " running" : " stopped";
  handles.objectiveLabel.textContent = snapshot.objective.label;
  handles.objectiveStatus.textContent = snapshot.objective.status;
  handles.objectiveProgress.textContent = formatPercent(snapshot.objective.progress);
  handles.objectiveProgressBar.style.width = formatPercent(snapshot.objective.progress);
  handles.objectiveDetail.textContent = snapshot.objective.detail;
  handles.entityCount.textContent = `${snapshot.entityCount} entities`;
  handles.tick.textContent = String(clock.ticks);
  handles.modules.textContent = String(sandbox.runtime.modules.length);
  handles.systems.textContent = String(sandbox.runtime.systems.values().length);
  renderSceneOverlay(handles, snapshot, state);

  if (shouldRenderWorkbench(handles)) {
    renderInspector(handles, sandbox, state);
    renderTimeline(handles, sandbox, state);
    handles.latestWorkbenchState = { ...state };
  }
}

export function updateCameraStatus(handles: SandboxUiHandles, status: SandboxCameraStatus): void {
  handles.latestCameraStatus = status;
  handles.cameraPosition.textContent = `${formatNumber(status.x)}, ${formatNumber(status.y)}`;
  handles.cameraZoom.textContent = status.zoom.toFixed(2);
  handles.cameraMode.textContent = status.mode;
}

export function updateInputStatus(handles: SandboxUiHandles, status: SandboxInputStatus): void {
  handles.inputAction.textContent = status.action;
  handles.inputContext.textContent = status.context;
}

export function updatePlatformStatus(
  _handles: SandboxUiHandles,
  _status: SandboxPlatformStatus
): void {
  // Platform is now summarized under the Host inspector tab. The function remains as the shell
  // integration point used by main.ts.
}

export function updateHostStatus(handles: SandboxUiHandles, host: AppHost): void {
  handles.latestHost = host;
  rerenderFromLatest(handles);
}

export function updateDataStatus(handles: SandboxUiHandles, registry: DataRegistry): void {
  handles.latestDataRegistry = registry;
  rerenderFromLatest(handles);
}

export function updateAssetStatus(handles: SandboxUiHandles, assetManager: AssetManager): void {
  handles.latestAssetManager = assetManager;
  rerenderFromLatest(handles);
}

function rerenderFromLatest(handles: SandboxUiHandles): void {
  if (!handles.latestSandbox) {
    return;
  }
  if (!shouldRenderWorkbench(handles)) {
    return;
  }

  const state = readWorkbenchState(handles);
  renderInspector(handles, handles.latestSandbox, state);
  renderTimeline(handles, handles.latestSandbox, state);
}

function shouldRenderWorkbench(handles: SandboxUiHandles): boolean {
  const now = performance.now();
  if (handles.lastWorkbenchRenderAt !== undefined && now - handles.lastWorkbenchRenderAt < 5000) {
    return false;
  }

  handles.lastWorkbenchRenderAt = now;
  return true;
}

function readWorkbenchState(handles: SandboxUiHandles): SandboxWorkbenchState {
  const previous = handles.latestWorkbenchState;
  const activeInspectorTab =
    handles.inspectorTabs.find((tab) => tab.classList.contains("is-active"))?.dataset
      .inspectorTab ??
    previous?.activeInspectorTab ??
    "actor";
  const timelineFilter =
    handles.timelineFilters.find((filter) => filter.classList.contains("is-active"))?.dataset
      .timelineFilter ??
    previous?.timelineFilter ??
    "all";

  return {
    selectedActorId: previous?.selectedActorId,
    selectedEntityId: previous?.selectedEntityId,
    selectionCleared: previous?.selectionCleared,
    followedEntityId: previous?.followedEntityId,
    activeInspectorTab: activeInspectorTab as SandboxWorkbenchState["activeInspectorTab"],
    timelineFilter: timelineFilter as SandboxWorkbenchState["timelineFilter"]
  };
}
