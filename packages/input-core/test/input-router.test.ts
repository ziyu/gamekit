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

  it("refreshes active analog values from moved input before the held tick", () => {
    const router = createInputRouter();
    router.registerAction({
      id: "game.move_right",
      name: "Move Right",
      defaultBindings: [
        { device: "gamepad", code: "Gamepad.Axis.LeftX.Positive", phase: "pressed" },
        { device: "gamepad", code: "Gamepad.Axis.LeftX.Positive", phase: "held" },
        { device: "gamepad", code: "Gamepad.Axis.LeftX.Positive", phase: "released" }
      ]
    });

    router.handle(
      input({
        id: "axis-start",
        device: "gamepad",
        deviceId: "pad:0:1",
        code: "Gamepad.Axis.LeftX.Positive",
        value: 0.4
      })
    );
    expect(
      router.handle(
        input({
          id: "axis-change",
          device: "gamepad",
          deviceId: "pad:0:1",
          code: "Gamepad.Axis.LeftX.Positive",
          phase: "moved",
          value: 0.8
        })
      )
    ).toEqual([]);

    expect(router.tick({ timestamp: 30 })[0]).toMatchObject({
      phase: "held",
      value: 0.8,
      input: { value: 0.8 }
    });
  });

  it("keeps identical controls from different gamepads isolated", () => {
    const router = createInputRouter();
    router.registerAction({
      id: "game.fire",
      name: "Fire",
      defaultBindings: [
        { device: "gamepad", code: "Gamepad.Trigger.Right", phase: "pressed" },
        { device: "gamepad", code: "Gamepad.Trigger.Right", phase: "held" },
        { device: "gamepad", code: "Gamepad.Trigger.Right", phase: "released" }
      ]
    });
    router.handle(
      input({
        id: "pad-a-down",
        device: "gamepad",
        deviceId: "pad:0:1",
        code: "Gamepad.Trigger.Right"
      })
    );
    router.handle(
      input({
        id: "pad-b-down",
        device: "gamepad",
        deviceId: "pad:1:1",
        code: "Gamepad.Trigger.Right"
      })
    );
    router.handle(
      input({
        id: "pad-a-up",
        device: "gamepad",
        deviceId: "pad:0:1",
        code: "Gamepad.Trigger.Right",
        phase: "released"
      })
    );

    expect(router.tick({ timestamp: 30 })).toHaveLength(1);
  });

  it("rejects non-finite normalized scalar values", () => {
    const router = createInputRouter();
    router.registerAction({
      id: "game.move",
      name: "Move",
      defaultBindings: [{ device: "gamepad", code: "axis", phase: "pressed" }]
    });

    expect(() =>
      router.handle(input({ device: "gamepad", code: "axis", value: Number.NaN }))
    ).toThrowError(expect.objectContaining({ code: "input.invalid_value" }));
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
