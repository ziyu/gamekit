import { useEffect, useMemo, useState } from "react";
import type { DevToolsPanelDefinition, DevToolsRuntime, DevToolsSnapshot } from "@gamekit/devtools";
import type { UiRuntime } from "@gamekit/ui-core";
import { createDevToolsUiBridge } from "../runtime";
import { renderStandardDevToolsPanel, type DevToolsPanelRenderer } from "../panels";

export type DevToolsShellProps = {
  runtime: DevToolsRuntime;
  uiRuntime?: UiRuntime | undefined;
  shellPanelId?: string | undefined;
  title?: string | undefined;
  refreshIntervalMs?: number | undefined;
  renderPanel?: DevToolsPanelRenderer | undefined;
};

export function DevToolsShell({
  runtime,
  uiRuntime,
  shellPanelId = "gamekit.devtools.shell",
  title = "GameKit DevTools",
  refreshIntervalMs = 250,
  renderPanel = renderStandardDevToolsPanel
}: DevToolsShellProps) {
  const [snapshot, setSnapshot] = useState<DevToolsSnapshot>(() =>
    runtime.snapshot({ includeSourceSnapshots: true })
  );
  const [activePanelId, setActivePanelId] = useState<string | undefined>(
    () => snapshot.panels[0]?.id
  );
  const activePanel = useMemo(
    () => readActivePanel(snapshot.panels, activePanelId),
    [activePanelId, snapshot.panels]
  );

  useEffect(() => {
    const update = () => {
      setSnapshot(runtime.snapshot({ includeSourceSnapshots: true }));
    };
    update();
    const interval = window.setInterval(update, refreshIntervalMs);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshIntervalMs, runtime]);

  const close = () => {
    if (!uiRuntime) {
      return;
    }
    createDevToolsUiBridge({
      devtools: runtime,
      ui: uiRuntime,
      shell: { panelId: shellPanelId, title }
    }).closeShell();
  };

  const focusDevTools = () => {
    if (!uiRuntime) {
      return;
    }
    createDevToolsUiBridge({
      devtools: runtime,
      ui: uiRuntime,
      shell: { panelId: shellPanelId, title }
    }).focusShell();
  };

  return (
    <section
      className="gamekit-devtools-shell"
      data-devtools-shell={shellPanelId}
      onPointerDown={focusDevTools}
    >
      <header className="gamekit-devtools-shell__header">
        <div>
          <strong>{title}</strong>
          <span>{snapshot.dataSources.length} sources</span>
        </div>
        {uiRuntime ? (
          <button type="button" onClick={close}>
            Close
          </button>
        ) : null}
      </header>
      <nav className="gamekit-devtools-shell__tabs" aria-label="DevTools panels">
        {snapshot.panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className={panel.id === activePanel?.id ? "is-active" : ""}
            onClick={() => setActivePanelId(panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </nav>
      <div className="gamekit-devtools-shell__body">
        {activePanel ? renderPanel({ snapshot, panel: activePanel }) : <EmptyPanel />}
      </div>
    </section>
  );
}

function readActivePanel(
  panels: DevToolsPanelDefinition[],
  activePanelId: string | undefined
): DevToolsPanelDefinition | undefined {
  return panels.find((panel) => panel.id === activePanelId) ?? panels[0];
}

function EmptyPanel() {
  return <p className="gamekit-devtools-empty">No DevTools panels registered.</p>;
}
