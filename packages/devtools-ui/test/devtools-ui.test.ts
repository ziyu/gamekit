import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDevToolsRuntime, type DevToolsPanelDefinition } from "@gamekit/devtools";
import { createUiRuntime } from "@gamekit/ui-core";
import {
  createDevToolsUiBridge,
  DevToolsLauncher,
  DevToolsShell,
  renderStandardDevToolsPanel
} from "../src";

describe("@gamekit/devtools-ui", () => {
  it("toggles the registered DevTools shell through the bridge", () => {
    const devtools = createDevToolsRuntime();
    const ui = createUiRuntime();

    const bridge = createDevToolsUiBridge({ devtools, ui });
    bridge.openShell();

    expect(bridge.snapshot().shell.open).toBe(true);
    expect(ui.panel("gamekit.devtools.shell")).toMatchObject({ kind: "devtools" });
    expect(ui.snapshot().focus.scope).toBe("devtools");

    bridge.closeShell();

    expect(bridge.snapshot().shell.open).toBe(false);
  });

  it("renders a launcher button without owning DevTools state", () => {
    const devtools = createDevToolsRuntime();
    const ui = createUiRuntime();

    const html = renderToStaticMarkup(
      createElement(DevToolsLauncher, { runtime: devtools, uiRuntime: ui, label: "Inspect" })
    );

    expect(html).toContain("Inspect");
    expect(html).toContain("gamekit-devtools-launcher");
  });

  it("renders registered sources, traces, profiler samples, and commands in the shell", () => {
    const devtools = createDevToolsRuntime({ clock: () => 100 });
    devtools.registerPanel({ id: "gamekit.devtools.sources", label: "Sources" });
    devtools.registerPanel({ id: "gamekit.devtools.traces", label: "Trace" });
    devtools.registerDataSource({
      id: "data",
      label: "Data Registry",
      kind: "data",
      snapshot: () => ({ documents: 4 })
    });
    devtools.registerCommand({
      id: "devtools.clear",
      label: "Clear",
      scope: "debug",
      execute: () => undefined
    });
    devtools.pushTrace({
      kind: "tca",
      label: "rule.fired",
      source: "tca",
      severity: "info"
    });
    devtools.markProfilerSample({
      systemId: "movement",
      moduleId: "sandbox.motion",
      tick: 3,
      startedAt: 90,
      durationMs: 1.5
    });

    const html = renderToStaticMarkup(createElement(DevToolsShell, { runtime: devtools }));

    expect(html).toContain("Data Registry");
    expect(html).toContain("1 sources");
    expect(html).toContain("Sources");
  });

  it("renders App Host standard panels with matching source snapshots and traces", () => {
    const devtools = createDevToolsRuntime({ clock: () => 100 });
    const runtimePanel: DevToolsPanelDefinition = {
      id: "devtools.runtime",
      label: "Runtime Flow",
      sourceKinds: ["runtime", "tca", "gas"]
    };
    devtools.registerPanel(runtimePanel);
    devtools.registerDataSource({
      id: "game",
      label: "Game Runtime",
      kind: "runtime",
      snapshot: () => ({
        running: true,
        clock: { ticks: 12 },
        systems: ["movement", "render"]
      })
    });
    devtools.registerDataSource({
      id: "data",
      label: "Data Registry",
      kind: "data",
      snapshot: () => ({ documents: 7 })
    });
    devtools.pushTrace({
      kind: "tca",
      label: "rule.sandbox.motion_heartbeat",
      source: "tca",
      severity: "info",
      status: "passed"
    });
    devtools.markProfilerSample({
      systemId: "movement",
      moduleId: "sandbox.motion",
      tick: 12,
      startedAt: 90,
      durationMs: 2.25
    });

    const snapshot = devtools.snapshot({ includeSourceSnapshots: true });
    const html = renderToStaticMarkup(
      createElement(() => renderStandardDevToolsPanel({ snapshot, panel: runtimePanel }))
    );

    expect(html).toContain("Runtime Flow");
    expect(html).toContain("Game Runtime");
    expect(html).toContain("rule.sandbox.motion_heartbeat");
    expect(html).toContain("movement");
    expect(html).not.toContain("Data Registry");
  });
});
