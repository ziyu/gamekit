import type { DevToolsSnapshot } from "@gamekit/devtools";
import { Metric } from "./panel-layout";
import {
  calculateFrameBarHeight,
  createPerformancePanelModel,
  readLifecycleStage
} from "./performance-model";
import { MiniTable } from "./value-format";

export function PerformancePanel({ snapshot }: { snapshot: DevToolsSnapshot }) {
  const {
    latestFrame,
    lifecycleSpans,
    lifecycleWarnings,
    liveHotSpots,
    liveSpans,
    liveWarnings,
    maxFrameTime
  } = createPerformancePanelModel(snapshot);
  const frameWindow = snapshot.profilerFrames.slice(-60);

  return (
    <section className="gamekit-devtools-panel gamekit-devtools-performance">
      <header className="gamekit-devtools-panel__summary">
        <div>
          <span>Panel</span>
          <strong>Performance</strong>
        </div>
        <Metric
          label="Frame Time"
          value={latestFrame ? `${latestFrame.deltaMs.toFixed(2)}ms` : "n/a"}
        />
        <Metric
          label="Runtime"
          value={latestFrame ? `${latestFrame.runtimeMs.toFixed(2)}ms` : "n/a"}
        />
        <Metric label="Live Spans" value={liveSpans.length} />
        <Metric label="Lifecycle" value={lifecycleSpans.length} />
      </header>

      <section className="gamekit-devtools-performance__section">
        <h3>Frame Window</h3>
        {snapshot.profilerFrames.length === 0 ? (
          <p className="gamekit-devtools-empty">No frame samples yet.</p>
        ) : (
          <div className="gamekit-devtools-frame-chart">
            {frameWindow.map((frame, index) => {
              const className = [
                frame.overBudgetCount > 0 ? "is-warning" : undefined,
                index === frameWindow.length - 1 ? "is-latest" : undefined
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <span
                  className={className || undefined}
                  key={frame.id}
                  style={{
                    height: `${calculateFrameBarHeight(frame.deltaMs, frameWindow, maxFrameTime)}%`
                  }}
                  title={`frame ${frame.tick ?? frame.id}: ${frame.deltaMs.toFixed(
                    2
                  )}ms frame time, ${frame.durationMs.toFixed(2)}ms measured work`}
                />
              );
            })}
          </div>
        )}
      </section>

      <div className="gamekit-devtools-performance__grid">
        <section className="gamekit-devtools-performance__section">
          <h3>Live Loop Hot Spots</h3>
          <MiniTable
            columns={["Name", "Category", "Source", "Avg", "P95", "Max", "Calls"]}
            empty="No live loop profiler spans yet."
            rows={liveHotSpots
              .slice(0, 12)
              .map((sample) => [
                <strong>{sample.name}</strong>,
                sample.category,
                sample.source,
                `${sample.averageDurationMs.toFixed(2)}ms`,
                `${sample.p95DurationMs.toFixed(2)}ms`,
                <span className={sample.overBudget ? "gamekit-devtools-warning-text" : undefined}>
                  {sample.maxDurationMs.toFixed(2)}ms
                </span>,
                sample.count
              ])}
          />
        </section>

        <section className="gamekit-devtools-performance__section">
          <h3>Live Budget Warnings</h3>
          <MiniTable
            columns={["Span", "Budget", "Max", "Status"]}
            empty="No live budget warnings."
            rows={liveWarnings
              .slice(0, 10)
              .map((sample) => [
                <strong>{sample.name}</strong>,
                sample.budgetWarningMs === undefined
                  ? "n/a"
                  : `${sample.budgetWarningMs.toFixed(2)}ms`,
                `${sample.maxDurationMs.toFixed(2)}ms`,
                <span
                  className={`gamekit-devtools-status gamekit-devtools-status--${
                    sample.critical ? "failed" : "warning"
                  }`}
                >
                  {sample.critical ? "critical" : "warning"}
                </span>
              ])}
          />
        </section>
      </div>

      <section className="gamekit-devtools-performance__section gamekit-devtools-performance__section--wide">
        <h3>Lifecycle Waterfall</h3>
        <MiniTable
          columns={["Stage", "Service", "Avg", "P95", "Max", "Calls", "Status"]}
          empty="No lifecycle spans recorded."
          rows={lifecycleSpans.map((sample) => [
            <strong>{readLifecycleStage(sample.name)}</strong>,
            sample.source,
            `${sample.averageDurationMs.toFixed(2)}ms`,
            `${sample.p95DurationMs.toFixed(2)}ms`,
            <span className={sample.overBudget ? "gamekit-devtools-warning-text" : undefined}>
              {sample.maxDurationMs.toFixed(2)}ms
            </span>,
            sample.count,
            sample.overBudget ? (
              <span
                className={`gamekit-devtools-status gamekit-devtools-status--${
                  sample.critical ? "failed" : "warning"
                }`}
              >
                {sample.critical ? "critical" : "warning"}
              </span>
            ) : (
              <span className="gamekit-devtools-status gamekit-devtools-status--completed">
                recorded
              </span>
            )
          ])}
        />
        {lifecycleWarnings.length > 0 ? (
          <p className="gamekit-devtools-note">
            Lifecycle warnings are one-shot startup or shutdown costs. They stay visible for startup
            diagnosis, but they are excluded from live loop hot spots.
          </p>
        ) : null}
      </section>
    </section>
  );
}
