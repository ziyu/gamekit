import { worldToScreen } from "@gamekit/camera-core";
import { SANDBOX_RENDER_SIZE, type SandboxSnapshot } from "../game";
import { escapeHtml, formatNumber } from "./format";
import type { SandboxUiHandles, SandboxWorkbenchState } from "./types";

export function renderSceneOverlay(
  handles: SandboxUiHandles,
  snapshot: SandboxSnapshot,
  state: SandboxWorkbenchState
): void {
  const selectedEntity = readSelectedEntity(snapshot, state);
  if (!selectedEntity) {
    handles.sceneOverlay.innerHTML = "";
    return;
  }

  const camera = handles.latestCameraStatus ?? {
    mode: "free",
    x: SANDBOX_RENDER_SIZE.width / 2,
    y: SANDBOX_RENDER_SIZE.height / 2,
    zoom: 1,
    rotation: 0,
    viewport: SANDBOX_RENDER_SIZE,
    minZoom: 0.5,
    maxZoom: 3
  };
  const screen = worldToScreen(camera, worldPercentToPoint(selectedEntity.x, selectedEntity.y));
  const left = `${(screen.x / SANDBOX_RENDER_SIZE.width) * 100}%`;
  const top = `${(screen.y / SANDBOX_RENDER_SIZE.height) * 100}%`;
  const size =
    selectedEntity.role === "command-core" ? 82 : selectedEntity.role === "scout" ? 48 : 66;
  const signal = renderEntitySignal(selectedEntity);
  const station = renderStationState(selectedEntity);
  const task = renderWorkState(selectedEntity);

  handles.sceneOverlay.innerHTML = `
    <div class="scene-focus ${selectedEntity.role === "scout" ? "scene-focus--unit" : "scene-focus--station"}" style="left: ${left}; top: ${top}; --focus-size: ${size}px;">
      <span class="scene-focus__corner scene-focus__corner--nw"></span>
      <span class="scene-focus__corner scene-focus__corner--ne"></span>
      <span class="scene-focus__corner scene-focus__corner--sw"></span>
      <span class="scene-focus__corner scene-focus__corner--se"></span>
    </div>
    <section class="scene-object-card" style="left: ${left}; top: ${top};">
      <div>
        <span>${escapeHtml(selectedEntity.role ?? "object")}</span>
        <strong>${escapeHtml(selectedEntity.label ?? selectedEntity.objectId ?? String(selectedEntity.id))}</strong>
      </div>
      <dl>
        <div><dt>Signal</dt><dd>${signal}</dd></div>
        <div><dt>Station</dt><dd>${station}</dd></div>
        <div><dt>Task</dt><dd>${task}</dd></div>
      </dl>
      <div class="scene-object-card__actions">
        <button type="button" data-scene-inspect="${escapeHtml(String(selectedEntity.id))}">Inspect</button>
        <button type="button" data-camera-follow="${escapeHtml(String(selectedEntity.id))}" class="${state.followedEntityId === selectedEntity.id ? "is-selected" : ""}">Follow</button>
      </div>
    </section>
  `;
}

function readSelectedEntity(
  snapshot: SandboxSnapshot,
  state: SandboxWorkbenchState
): SandboxSnapshot["entities"][number] | undefined {
  return (
    snapshot.entities.find((entity) => entity.id === snapshot.selected?.entityId) ??
    snapshot.entities.find((entity) => entity.id === state.selectedEntityId) ??
    snapshot.entities.find((entity) => entity.actorId === state.selectedActorId)
  );
}

function worldPercentToPoint(percentX: number, percentY: number): { x: number; y: number } {
  return {
    x: (percentX / 100) * SANDBOX_RENDER_SIZE.width,
    y: (percentY / 100) * SANDBOX_RENDER_SIZE.height
  };
}

function renderEntitySignal(entity: SandboxSnapshot["entities"][number]): string {
  if (entity.signal === undefined || entity.capacity === undefined) {
    return "none";
  }

  const fragments = entity.fragments ? ` · ${formatNumber(entity.fragments)} frg` : "";
  return `${formatNumber(entity.signal)} / ${formatNumber(entity.capacity)}${fragments}`;
}

function renderStationState(entity: SandboxSnapshot["entities"][number]): string {
  if (!entity.station) {
    return "none";
  }

  return `${entity.station.zone} · ${formatNumber(entity.station.stability)} stability · ${formatNumber(entity.station.heat)} heat`;
}

function renderWorkState(entity: SandboxSnapshot["entities"][number]): string {
  if (!entity.task) {
    return entity.role === "scout" ? "idle" : "none";
  }

  return `${entity.task}/${entity.taskStatus ?? "idle"} → ${entity.targetObjectId ?? "none"}`;
}
