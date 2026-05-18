import { CommandList, DiagnosticList, ProfilerList, TraceList } from "./activity-panels";
import { createPanelModel } from "./panel-filters";
import { PanelSummary } from "./panel-layout";
import { SourceSnapshotList } from "./source-views";
import type { DevToolsPanelRendererProps } from "./panel-types";

export type { DevToolsPanelRenderer, DevToolsPanelRendererProps } from "./panel-types";

export function renderStandardDevToolsPanel({ snapshot, panel }: DevToolsPanelRendererProps) {
  if (panel.id === "gamekit.devtools.commands") {
    return <CommandList snapshot={snapshot} />;
  }

  const model = createPanelModel(snapshot, panel);
  return (
    <section className="gamekit-devtools-panel">
      <PanelSummary
        diagnostics={model.diagnostics.length}
        panel={panel}
        sources={model.sources.length}
        traces={model.traces.length}
      />
      <div className="gamekit-devtools-panel__grid">
        <section className="gamekit-devtools-panel__main">
          <SourceSnapshotList sources={model.sources} />
        </section>
        <aside className="gamekit-devtools-panel__side">
          <TraceList traces={model.traces} />
          <DiagnosticList diagnostics={model.diagnostics} />
          <ProfilerList snapshot={snapshot} sourceKinds={model.sourceKinds} />
          <CommandList snapshot={snapshot} compact />
        </aside>
      </div>
    </section>
  );
}
