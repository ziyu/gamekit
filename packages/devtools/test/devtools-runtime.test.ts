import { describe, expect, it } from "vitest";
import { createDevToolsRuntime } from "@gamekit/devtools";

describe("devtools runtime", () => {
  it("registers data sources, panels, commands and snapshots them", () => {
    const runtime = createDevToolsRuntime({ clock: () => 10 });

    runtime.registerDataSource({
      id: "host",
      label: "Host",
      kind: "host",
      snapshot() {
        return { phase: "started" };
      }
    });
    runtime.registerPanel({ id: "events", label: "Events", order: 2 });
    runtime.registerPanel({ id: "host", label: "Host", order: 1 });
    runtime.registerCommand({
      id: "debug.clear",
      label: "Clear",
      scope: "debug",
      execute() {
        runtime.clear({ traces: true });
      }
    });

    const snapshot = runtime.snapshot({ includeSourceSnapshots: true });

    expect(snapshot.dataSources).toEqual([{ id: "host", label: "Host", kind: "host" }]);
    expect(snapshot.sourceSnapshots?.[0]?.snapshot).toEqual({ phase: "started" });
    expect(snapshot.panels.map((panel) => panel.id)).toEqual(["host", "events"]);
    expect(snapshot.commands.map((command) => command.id)).toEqual(["debug.clear"]);
  });

  it("keeps bounded trace and diagnostic buffers", () => {
    const runtime = createDevToolsRuntime({
      traceLimit: 2,
      diagnosticLimit: 1,
      clock: () => 1
    });

    runtime.pushTrace({ kind: "event", label: "a", source: "test" });
    runtime.pushTrace({ kind: "event", label: "b", source: "test" });
    runtime.pushTrace({ kind: "event", label: "c", source: "test" });
    runtime.pushDiagnostic({
      type: "first",
      severity: "warning",
      source: "test",
      message: "first",
      payload: {}
    });
    runtime.pushDiagnostic({
      type: "second",
      severity: "error",
      source: "test",
      message: "second",
      payload: {}
    });

    expect(runtime.snapshot().traces.map((trace) => trace.label)).toEqual(["b", "c"]);
    expect(runtime.snapshot().diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["second"]);
  });

  it("records source snapshot failures as diagnostics without failing whole snapshot", () => {
    const runtime = createDevToolsRuntime({ clock: () => 2 });
    runtime.registerDataSource({
      id: "broken",
      label: "Broken",
      kind: "custom",
      snapshot() {
        throw new Error("boom");
      }
    });

    const snapshot = runtime.snapshot({ includeSourceSnapshots: true });

    expect(snapshot.sourceSnapshots?.[0]?.error?.code).toBe("devtools.data_source_snapshot_failed");
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.type)).toContain(
      "devtools.data_source_snapshot_failed"
    );
  });

  it("aggregates profiler samples", () => {
    const runtime = createDevToolsRuntime({ profilerBudgetMs: 4 });

    runtime.markProfilerSample({ systemId: "move", tick: 1, startedAt: 0, durationMs: 2 });
    runtime.markProfilerSample({
      systemId: "move",
      moduleId: "game",
      tick: 2,
      startedAt: 10,
      durationMs: 6,
      tags: ["hot"]
    });

    const profiler = runtime.snapshot().profiler;

    expect(profiler).toHaveLength(2);
    expect(profiler[0]).toMatchObject({
      systemId: "move",
      moduleId: "game",
      count: 1,
      maxDurationMs: 6,
      overBudget: true,
      tags: ["hot"]
    });
  });

  it("executes commands with trace and diagnostics on failure", async () => {
    const runtime = createDevToolsRuntime({ clock: () => 3 });
    runtime.registerCommand({
      id: "debug.fail",
      label: "Fail",
      scope: "debug",
      execute() {
        throw new Error("nope");
      }
    });

    await expect(runtime.executeCommand("debug.fail")).rejects.toThrow("nope");

    expect(runtime.snapshot().traces.map((trace) => trace.status)).toContain("started");
    expect(runtime.snapshot().diagnostics.map((diagnostic) => diagnostic.commandId)).toContain(
      "debug.fail"
    );
  });

  it("unregisters commands owned by a data source", () => {
    const runtime = createDevToolsRuntime();
    const unregister = runtime.registerDataSource({
      id: "data",
      label: "Data",
      kind: "data",
      snapshot() {
        return {};
      },
      actions: [
        {
          id: "data.reload",
          label: "Reload",
          scope: "debug",
          execute() {}
        }
      ]
    });

    expect(runtime.snapshot().commands.map((command) => command.id)).toEqual(["data.reload"]);

    unregister();

    expect(runtime.snapshot().commands).toEqual([]);
  });
});
