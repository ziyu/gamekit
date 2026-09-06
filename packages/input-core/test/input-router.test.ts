import { describe, expect, it } from "vitest";
import { createInputRouter, matchesInputBinding, type NormalizedInputEvent } from "../src";

describe("input binding", () => {
  it("matches device, phase, code, button, and modifiers", () => {
    expect(
      matchesInputBinding(
        {
          device: "keyboard",
          phase: "pressed",
          code: "KeyK",
          modifiers: ["shift"]
        },
        input({ code: "KeyK", modifiers: { shift: true } })
      )
    ).toBe(true);

    expect(
      matchesInputBinding(
        {
          device: "keyboard",
          phase: "pressed",
          code: "KeyK",
          modifiers: ["ctrl"]
        },
        input({ code: "KeyK", modifiers: { shift: true } })
      )
    ).toBe(false);
  });
});

describe("createInputRouter", () => {
  it("emits actions for matching bindings", () => {
    const router = createInputRouter();
    const observed: string[] = [];

    router.registerAction({
      id: "game.confirm",
      name: "Confirm",
      defaultBindings: [{ device: "keyboard", code: "Enter", phase: "pressed" }]
    });
    router.onAction((event) => observed.push(event.actionId));

    const events = router.handle(input({ code: "Enter" }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actionId: "game.confirm",
      contextId: "global",
      value: 1
    });
    expect(observed).toEqual(["game.confirm"]);
  });

  it("uses context priority and capture to block lower contexts", () => {
    const router = createInputRouter();

    router.registerAction({
      id: "game.confirm",
      name: "Confirm",
      defaultBindings: [{ device: "keyboard", code: "Enter", phase: "pressed" }]
    });
    router.registerAction({
      id: "ui.close_window",
      name: "Close",
      defaultBindings: [{ device: "keyboard", code: "Enter", phase: "pressed" }]
    });
    router.addContext({
      id: "gameplay",
      priority: 10,
      actionIds: ["game.confirm"]
    });
    router.addContext({
      id: "modal",
      priority: 100,
      actionIds: ["ui.close_window"]
    });

    expect(router.handle(input({ code: "Enter" })).map((event) => event.actionId)).toEqual([
      "ui.close_window"
    ]);

    router.disableContext("modal");

    expect(router.handle(input({ code: "Enter" })).map((event) => event.actionId)).toEqual([
      "game.confirm"
    ]);
  });

  it("allows non-capturing contexts to pass through", () => {
    const router = createInputRouter();

    router.registerAction({
      id: "debug.toggle",
      name: "Debug",
      defaultBindings: [{ device: "keyboard", code: "Backquote", phase: "pressed" }]
    });
    router.registerAction({
      id: "game.confirm",
      name: "Confirm",
      defaultBindings: [{ device: "keyboard", code: "Backquote", phase: "pressed" }]
    });
    router.addContext({
      id: "debug",
      priority: 100,
      actionIds: ["debug.toggle"],
      capture: false
    });

    expect(router.handle(input({ code: "Backquote" })).map((event) => event.actionId)).toEqual([
      "debug.toggle",
      "game.confirm"
    ]);
  });

  it("filters scoped contexts by input scope", () => {
    const router = createInputRouter();

    router.registerAction({
      id: "camera.pan_left",
      name: "Pan Left",
      scopes: ["game"],
      defaultBindings: [{ device: "keyboard", code: "KeyA", phase: "pressed" }]
    });
    router.addContext({
      id: "camera",
      priority: 10,
      actionIds: ["camera.pan_left"],
      scopes: ["game"]
    });

    expect(router.handle(input({ code: "KeyA", scope: "ui" }))).toEqual([]);
    expect(
      router.handle(input({ code: "KeyA", scope: "game" })).map((event) => event.actionId)
    ).toEqual(["camera.pan_left"]);
  });

  it("flushes active pressed actions as held actions until release", () => {
    const router = createInputRouter();
    const observed: Array<{ actionId: string; phase: string; timestamp: number }> = [];

    router.registerAction({
      id: "camera.pan_left",
      name: "Pan Left",
      defaultBindings: [
        { device: "keyboard", code: "KeyA", phase: "pressed" },
        { device: "keyboard", code: "KeyA", phase: "held" },
        { device: "keyboard", code: "KeyA", phase: "released" }
      ]
    });
    router.onAction((event) =>
      observed.push({
        actionId: event.actionId,
        phase: event.phase,
        timestamp: event.timestamp
      })
    );

    router.handle(input({ id: "down", code: "KeyA", timestamp: 10 }));
    const held = router.tick({ timestamp: 26, delta: 16 });
    router.handle(input({ id: "up", code: "KeyA", phase: "released", timestamp: 30 }));
    const afterRelease = router.tick({ timestamp: 46, delta: 16 });

    expect(held).toHaveLength(1);
    expect(afterRelease).toHaveLength(0);
    expect(observed).toEqual([
      { actionId: "camera.pan_left", phase: "pressed", timestamp: 10 },
      { actionId: "camera.pan_left", phase: "held", timestamp: 26 },
      { actionId: "camera.pan_left", phase: "released", timestamp: 30 }
    ]);
  });

  it("stops held actions when their context or action is removed", () => {
    const router = createInputRouter({ defaultContexts: [{ id: "game", priority: 10 }] });
    router.registerAction({
      id: "move",
      name: "Move",
      defaultBindings: [{ device: "keyboard", code: "KeyW" }]
    });
    router.handle(input({ id: "down", code: "KeyW" }));
    router.disableContext("game");
    expect(router.tick({ timestamp: 20 })).toEqual([]);
    router.enableContext("game");
    router.handle(input({ id: "down-2", code: "KeyW" }));
    router.unregisterAction("move");
    expect(router.tick({ timestamp: 30 })).toEqual([]);
  });

  it("keeps held event ids bounded over long presses", () => {
    const router = createInputRouter();
    router.registerAction({
      id: "move",
      name: "Move",
      defaultBindings: [{ device: "keyboard", code: "KeyW" }]
    });
    router.handle(input({ id: "down", code: "KeyW" }));
    let id = "";
    for (let index = 0; index < 3600; index += 1)
      id = router.tick({ timestamp: index })[0]?.input.id ?? id;
    expect(id.length).toBeLessThan(64);
  });
});

function input(patch: Partial<NormalizedInputEvent> = {}): NormalizedInputEvent {
  return {
    id: "input-1",
    device: "keyboard",
    phase: "pressed",
    timestamp: 10,
    ...patch
  };
}

describe("input cancellation", () => {
  it.each(["disable", "removeContext", "unregister", "rebind", "cancelAll", "scopeRelease"])(
    "clears consumer state on %s",
    (reason) => {
      const router = createInputRouter({
        defaultContexts: [{ id: "game", priority: 10, scopes: ["game"] }]
      });
      router.registerAction({
        id: "move",
        name: "Move",
        scopes: ["game"],
        defaultBindings: [{ device: "keyboard", code: "KeyW" }]
      });
      const phases: string[] = [];
      let held = false;
      router.onAction((event) => {
        phases.push(event.phase);
        held = event.value !== 0;
      });
      router.handle(input({ code: "KeyW", scope: "game" }));
      expect(held).toBe(true);
      if (reason === "disable") {
        router.disableContext("game");
        router.enableContext("game");
      }
      if (reason === "removeContext") router.removeContext("game");
      if (reason === "unregister") router.unregisterAction("move");
      if (reason === "rebind")
        router.setActionBindings("move", [{ device: "keyboard", code: "KeyS" }]);
      if (reason === "cancelAll") router.cancelAll();
      if (reason === "scopeRelease")
        router.handle(input({ code: "KeyW", phase: "released", scope: "ui" }));
      expect(held).toBe(false);
      expect(phases).toEqual(["pressed", "cancelled"]);
      expect(router.tick({ timestamp: 20 })).toEqual([]);
    }
  );
});

it("notifies remaining cancellation consumers even when one listener throws", () => {
  const router = createInputRouter();
  router.registerAction({
    id: "move",
    name: "Move",
    defaultBindings: [{ device: "keyboard", code: "KeyW" }]
  });
  let released = false;
  router.onAction((event) => {
    if (event.phase === "cancelled") throw new Error("listener failed");
  });
  router.onAction((event) => {
    if (event.phase === "cancelled") released = true;
  });
  router.handle(input({ code: "KeyW" }));
  expect(() => router.cancelAll()).toThrow("listener failed");
  expect(released).toBe(true);
  expect(router.tick({ timestamp: 20 })).toEqual([]);
});
