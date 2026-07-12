import type {
  AnyEventListener,
  EventBus,
  EventBusOptions,
  EventListener,
  GameEvent
} from "./types";

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const clock = options.clock ?? (() => Date.now());
  const listenersByType = new Map<string, Set<EventListener<any>>>();
  const anyListeners = new Set<AnyEventListener>();

  return {
    emit(type, payload, source, correlation) {
      const event: GameEvent<typeof payload> = {
        type,
        payload,
        timestamp: clock(),
        ...(source === undefined ? {} : { source }),
        ...(correlation?.correlationId === undefined
          ? {}
          : { correlationId: correlation.correlationId }),
        ...(correlation?.parentId === undefined ? {} : { parentId: correlation.parentId })
      };

      const listeners = listenersByType.get(type);
      if (listeners) {
        for (const listener of Array.from(listeners)) {
          listener(event);
        }
      }

      for (const listener of Array.from(anyListeners)) {
        listener(event);
      }
    },
    on(type, listener) {
      let listeners = listenersByType.get(type);
      if (!listeners) {
        listeners = new Set();
        listenersByType.set(type, listeners);
      }

      listeners.add(listener);

      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          listenersByType.delete(type);
        }
      };
    },
    onAny(listener) {
      anyListeners.add(listener);

      return () => {
        anyListeners.delete(listener);
      };
    },
    clear() {
      listenersByType.clear();
      anyListeners.clear();
    }
  };
}
