import type { EventBus } from "@gamekit/event-bus";
import type { TcaRuntime } from "./types";

export function bridgeTcaToEventBus(runtime: TcaRuntime, eventBus: EventBus): () => void {
  return eventBus.onAny((event) => {
    runtime.handleEvent(event);
  });
}
