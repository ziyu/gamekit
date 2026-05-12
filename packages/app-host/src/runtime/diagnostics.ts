import type { AppDiagnosticEvent, AppDiagnostics } from "./types";

export function createAppDiagnostics(
  options: { clock?: (() => number) | undefined; limit?: number | undefined } = {}
) {
  const clock = options.clock ?? Date.now;
  const limit = options.limit ?? 100;
  const events: AppDiagnosticEvent[] = [];

  const diagnostics: AppDiagnostics = {
    emit(event) {
      events.push({
        ...event,
        timestamp: event.timestamp ?? clock()
      });
      if (events.length > limit) {
        events.shift();
      }
    },
    list() {
      return [...events];
    },
    clear() {
      events.length = 0;
    }
  };

  return diagnostics;
}
