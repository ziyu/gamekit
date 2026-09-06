import { describe, expect, it } from "vitest";
import { createEventBus, type GameEvent } from "../src/index";

describe("createEventBus", () => {
  it("emits events with source and timestamp", () => {
    const bus = createEventBus({ clock: () => 123 });
    const received: GameEvent[] = [];

    bus.on("hero.enter_tile", (event) => received.push(event));
    bus.emit("hero.enter_tile", { heroId: "hero-1" }, "test");

    expect(received).toEqual([
      {
        type: "hero.enter_tile",
        payload: { heroId: "hero-1" },
        timestamp: 123,
        source: "test"
      }
    ]);
  });

  it("keeps listener order and supports unsubscribe", () => {
    const bus = createEventBus({ clock: () => 0 });
    const received: string[] = [];

    bus.on("event", () => received.push("a"));
    const unsubscribe = bus.on("event", () => received.push("b"));
    bus.on("event", () => received.push("c"));

    bus.emit("event", {});
    unsubscribe();
    bus.emit("event", {});

    expect(received).toEqual(["a", "b", "c", "a", "c"]);
  });

  it("carries correlation metadata without putting it in gameplay payload", () => {
    const bus = createEventBus({ clock: () => 456 });
    const received: GameEvent[] = [];

    bus.on("ability.requested", (event) => received.push(event));
    bus.emit("ability.requested", { actorId: "actor-1" }, "multiplayer", {
      correlationId: "command-7",
      parentId: "network-trace-3"
    });

    expect(received).toEqual([
      {
        type: "ability.requested",
        payload: { actorId: "actor-1" },
        timestamp: 456,
        source: "multiplayer",
        correlationId: "command-7",
        parentId: "network-trace-3"
      }
    ]);
  });

  it("supports onAny debug listeners", () => {
    const bus = createEventBus({ clock: () => 0 });
    const received: string[] = [];

    bus.onAny((event) => received.push(event.type));
    bus.emit("runtime.started", {});
    bus.emit("runtime.stopped", {});

    expect(received).toEqual(["runtime.started", "runtime.stopped"]);
  });
});
