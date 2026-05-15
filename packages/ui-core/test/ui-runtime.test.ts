import { describe, expect, it } from "vitest";
import { createUiRuntime } from "../src";

describe("createUiRuntime", () => {
  it("registers, opens, toggles, and closes panels", () => {
    const ui = createUiRuntime();
    ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" });

    ui.open("actor", { actorId: "a" });
    expect(ui.snapshot().openPanels).toMatchObject([
      { id: "actor", props: { actorId: "a" }, focused: true }
    ]);
    expect(ui.focus()).toMatchObject({ scope: "ui", target: "actor" });

    ui.toggle("actor");
    expect(ui.openPanels()).toEqual([]);
  });

  it("throws on duplicate panels and missing panel opens", () => {
    const ui = createUiRuntime();
    ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" });

    expect(() => ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" })).toThrow(
      "Duplicate UI panel"
    );
    expect(() => ui.open("missing")).toThrow("Missing UI panel");
  });

  it("dispatches common UI commands and keeps bounded command history", () => {
    const ui = createUiRuntime({ commandHistoryLimit: 2 });
    ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" });

    ui.dispatch({ type: "ui.open", target: "actor" });
    ui.dispatch({ type: "custom", source: "test" });
    ui.dispatch({ type: "custom2", source: "test" });

    expect(ui.commands().map((command) => command.type)).toEqual(["custom", "custom2"]);
  });

  it("notifies subscribers when state changes", () => {
    const ui = createUiRuntime();
    let calls = 0;
    const unsubscribe = ui.subscribe(() => {
      calls += 1;
    });

    ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" });
    unsubscribe();
    ui.setFocus({ scope: "game", target: "viewport" });

    expect(calls).toBe(1);
  });

  it("returns a stable snapshot reference until state changes", () => {
    const ui = createUiRuntime();
    const emptySnapshot = ui.snapshot();

    expect(ui.snapshot()).toBe(emptySnapshot);

    ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" });
    const registeredSnapshot = ui.snapshot();

    expect(registeredSnapshot).not.toBe(emptySnapshot);
    expect(ui.snapshot()).toBe(registeredSnapshot);

    ui.open("actor");
    expect(ui.snapshot()).not.toBe(registeredSnapshot);
  });
});
