import type { AppHost } from "@gamekit/app-host";
import type { DataRegistry } from "@gamekit/data";
import type { SandboxRuntime, SandboxSnapshot } from "../game";
import { escapeHtml, formatNumber, upper } from "./format";
import type { SandboxUiHandles, SandboxWorkbenchState } from "./types";

export function renderInspector(
  handles: SandboxUiHandles,
  sandbox: SandboxRuntime,
  state: SandboxWorkbenchState
): void {
  const snapshot = sandbox.snapshot({
    selectedActorId: state.selectedActorId,
    selectedEntityId: state.selectedEntityId
  });
  const selectedActorId = snapshot.selected?.actorId ?? snapshot.gasActors[0]?.actor.actorId;
  if (!state.selectedActorId && !state.selectedEntityId && selectedActorId) {
    state.selectedActorId = selectedActorId;
  }

  const selectedEntity = snapshot.entities.find(
    (entity) => entity.id === snapshot.selected?.entityId
  );
  handles.selectedActor.textContent =
    selectedEntity?.label ?? selectedActorId ?? snapshot.selected?.entityId?.toString() ?? "none";
  setActiveTabs(handles, state);

  if (state.activeInspectorTab === "runtime") {
    handles.inspectorBody.innerHTML = renderRuntimeTab(snapshot);
    return;
  }
  if (state.activeInspectorTab === "content") {
    handles.inspectorBody.innerHTML = renderContentTab(snapshot, handles.latestDataRegistry);
    return;
  }
  if (state.activeInspectorTab === "rules") {
    handles.inspectorBody.innerHTML = renderRulesTab(snapshot);
    return;
  }
  if (state.activeInspectorTab === "host") {
    handles.inspectorBody.innerHTML = renderHostTab(handles.latestHost);
    return;
  }

  handles.inspectorBody.innerHTML = renderActorTab(snapshot, state, selectedActorId);
}

function renderActorTab(
  snapshot: SandboxSnapshot,
  state: SandboxWorkbenchState,
  selectedActorId: string | undefined
): string {
  const selectedActor = snapshot.gasActors.find((actor) => actor.actor.actorId === selectedActorId);
  const selectedEntity =
    snapshot.entities.find((entity) => entity.id === snapshot.selected?.entityId) ??
    snapshot.entities.find((entity) => entity.actorId === selectedActorId);
  const sceneObjects = snapshot.entities.filter(
    (entity) => entity.role && entity.role !== "signal-link"
  );

  return `
    <section class="inspector-section">
      <h2>Outpost Objects</h2>
      <ol class="summary-list">
        ${sceneObjects
          .map(
            (entity) => `
          <li>
            <button type="button" class="entity-row ${entity.id === selectedEntity?.id ? "is-selected" : ""}" data-select-entity="${escapeHtml(String(entity.id))}" ${entity.actorId ? `data-select-actor="${escapeHtml(entity.actorId)}"` : ""}>
              <code>${escapeHtml(entity.label ?? entity.objectId ?? String(entity.id))}</code>
              <strong>${escapeHtml(entity.role ?? "object")}</strong>
              <span>${renderEntitySignal(entity)}${entity.station ? ` · p${entity.station.priority} · ${escapeHtml(entity.station.zone)}` : ""}</span>
            </button>
          </li>
        `
          )
          .join("")}
      </ol>
    </section>

    <section class="inspector-section">
      <h2>GAS Actors</h2>
      <div class="actor-buttons">
        ${snapshot.gasActors
          .map(
            (actor) => `
          <button type="button" data-select-actor="${escapeHtml(actor.actor.actorId)}" ${actor.actor.entityId === undefined ? "" : `data-select-entity="${escapeHtml(String(actor.actor.entityId))}"`} class="${actor.actor.actorId === selectedActorId ? "is-selected" : ""}">
            <span>${escapeHtml(formatActorName(actor.actor.actorId))}</span>
            <strong>${formatNumber(actor.attributes.current.health ?? 0)} hp</strong>
          </button>
        `
          )
          .join("")}
      </div>
    </section>

    <section class="inspector-section">
      <h2>Entity Link</h2>
      <dl class="kv">
        <div><dt>Object</dt><dd>${escapeHtml(selectedEntity?.label ?? selectedEntity?.objectId ?? "unbound")}</dd></div>
        <div><dt>Role</dt><dd>${escapeHtml(selectedEntity?.role ?? "unknown")}</dd></div>
        <div><dt>Entity</dt><dd>${escapeHtml(String(selectedEntity?.id ?? "unbound"))}</dd></div>
        <div><dt>Render</dt><dd>${escapeHtml(selectedEntity?.renderObjectId ?? "pending")}</dd></div>
        <div><dt>Position</dt><dd>${formatNumber(selectedEntity?.x ?? 0)}, ${formatNumber(selectedEntity?.y ?? 0)}</dd></div>
        <div><dt>Velocity</dt><dd>${formatNumber(selectedEntity?.vx ?? 0)}, ${formatNumber(selectedEntity?.vy ?? 0)}</dd></div>
        <div><dt>Signal</dt><dd>${renderEntitySignal(selectedEntity)}</dd></div>
        <div><dt>Station</dt><dd>${renderStationState(selectedEntity)}</dd></div>
        <div><dt>Task</dt><dd>${renderWorkState(selectedEntity)}</dd></div>
      </dl>
      <div class="inspector-actions">
        ${
          selectedEntity
            ? `<button type="button" data-camera-follow="${escapeHtml(String(selectedEntity.id))}" class="${state.followedEntityId === selectedEntity.id ? "is-selected" : ""}">Follow Camera</button>`
            : ""
        }
        <button type="button" data-camera-stop-follow>Free Camera</button>
      </div>
    </section>

    <section class="inspector-section">
      <h2>GAS State</h2>
      <dl class="kv">
        ${Object.entries(selectedActor?.attributes.current ?? {})
          .map(
            ([key, value]) => `
          <div><dt>${escapeHtml(key)}</dt><dd>${formatNumber(value)}</dd></div>
        `
          )
          .join("")}
        <div><dt>Tags</dt><dd>${escapeHtml(selectedActor?.tags.values.join(", ") || "none")}</dd></div>
        <div><dt>Effects</dt><dd>${escapeHtml(selectedActor?.effects.active.map((effect) => effect.effectId).join(", ") || "none")}</dd></div>
      </dl>
    </section>
  `;
}

function renderEntitySignal(entity: SandboxSnapshot["entities"][number] | undefined): string {
  if (!entity || entity.signal === undefined || entity.capacity === undefined) {
    return "no storage";
  }

  const fragments = entity.fragments ? ` · ${formatNumber(entity.fragments)} frg` : "";
  return `${formatNumber(entity.signal)} / ${formatNumber(entity.capacity)}${fragments}`;
}

function renderStationState(entity: SandboxSnapshot["entities"][number] | undefined): string {
  if (!entity?.station) {
    return "none";
  }

  return `${entity.station.zone} · stability ${formatNumber(entity.station.stability)} · heat ${formatNumber(entity.station.heat)} · mode ${entity.station.mode}`;
}

function renderWorkState(entity: SandboxSnapshot["entities"][number] | undefined): string {
  if (!entity?.task) {
    return "none";
  }

  return `${entity.task}/${entity.taskStatus ?? "idle"} → ${entity.targetObjectId ?? "none"} · route ${formatNumber((entity.routeProgress ?? 0) * 100)}% · battery ${formatNumber(entity.battery ?? 0)} · fatigue ${formatNumber(entity.fatigue ?? 0)}`;
}

function formatActorName(actorId: string): string {
  return actorId.replace("gas.actor.sandbox.", "");
}

function renderRuntimeTab(snapshot: SandboxSnapshot): string {
  return `
    <section class="inspector-section">
      <h2>Module Flow</h2>
      <ol class="summary-list">
        ${snapshot.moduleSummary
          .map(
            (module) => `
          <li>
            <code>${escapeHtml(module.id)}</code>
            <strong>${escapeHtml(module.status)}</strong>
            <span>${escapeHtml(module.detail)}</span>
          </li>
        `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderContentTab(snapshot: SandboxSnapshot, registry: DataRegistry | undefined): string {
  const documents = registry?.snapshot().documents.slice(0, 10) ?? [];
  return `
    <section class="inspector-section">
      <h2>Content Graph</h2>
      <dl class="kv">
        <div><dt>Packs</dt><dd>${snapshot.contentSummary.packs}</dd></div>
        <div><dt>Types</dt><dd>${snapshot.contentSummary.types}</dd></div>
        <div><dt>Documents</dt><dd>${snapshot.contentSummary.documents}</dd></div>
        <div><dt>References</dt><dd>${snapshot.contentSummary.references}</dd></div>
        <div><dt>Assets loaded</dt><dd>${snapshot.contentSummary.assetsLoaded}</dd></div>
        <div><dt>Assets failed</dt><dd>${snapshot.contentSummary.assetsFailed}</dd></div>
      </dl>
    </section>
    <section class="inspector-section">
      <h2>Recent Data</h2>
      <ol class="summary-list">
        ${documents
          .map(
            (document) => `
          <li>
            <code>${escapeHtml(document.type)}:${escapeHtml(document.id)}</code>
            <span>${document.tags.map(escapeHtml).join(" · ") || "untagged"}</span>
          </li>
        `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderRulesTab(snapshot: SandboxSnapshot): string {
  return `
    <section class="inspector-section">
      <h2>TCA Rules</h2>
      <dl class="kv">
        <div><dt>Rules</dt><dd>${snapshot.tcaRuleCount}</dd></div>
        <div><dt>TCA traces</dt><dd>${snapshot.tcaTraces.length}</dd></div>
        <div><dt>GAS traces</dt><dd>${snapshot.gasTraces.length}</dd></div>
      </dl>
      <ol class="summary-list">
        ${snapshot.tcaTraces
          .slice()
          .reverse()
          .slice(0, 8)
          .map(
            (trace) => `
          <li>
            <code>${escapeHtml(trace.ruleId)}</code>
            <strong>${escapeHtml(upper(trace.status))}</strong>
            <span>${escapeHtml(trace.eventType)} · ${trace.actions.length} actions</span>
          </li>
        `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderHostTab(host: AppHost | undefined): string {
  const snapshot = host?.snapshot();
  return `
    <section class="inspector-section">
      <h2>App Host</h2>
      <dl class="kv">
        <div><dt>Phase</dt><dd>${escapeHtml(snapshot?.phase ?? "pending")}</dd></div>
        <div><dt>Services</dt><dd>${snapshot?.services.length ?? 0}</dd></div>
        <div><dt>Diagnostics</dt><dd>${snapshot?.diagnostics.length ?? 0}</dd></div>
      </dl>
      <ol class="summary-list">
        ${(snapshot?.services ?? [])
          .map(
            (service) => `
          <li>
            <code>${escapeHtml(service.id)}</code>
            <strong>${escapeHtml(service.phase)}</strong>
            <span>deps ${service.dependencies.length}</span>
          </li>
        `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function setActiveTabs(handles: SandboxUiHandles, state: SandboxWorkbenchState): void {
  for (const tab of handles.inspectorTabs) {
    tab.classList.toggle("is-active", tab.dataset.inspectorTab === state.activeInspectorTab);
  }
}
