import type { GameEvent } from "@gamekit/event-bus";

export function recordEvents() {
  const events: GameEvent[] = [];

  return {
    events,
    push(event: GameEvent) {
      events.push(event);
    },
    types() {
      return events.map((event) => event.type);
    }
  };
}
