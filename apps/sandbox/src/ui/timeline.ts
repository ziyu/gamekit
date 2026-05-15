import { createGameKitUiAnimator } from "@gamekit/react-ui";
import type { SandboxRuntime } from "../game";
import { escapeHtml, upper } from "./format";
import type { SandboxUiHandles, SandboxWorkbenchState } from "./types";

const timelineAnimator = createGameKitUiAnimator({ duration: 0.24 });

export function renderTimeline(
  handles: SandboxUiHandles,
  sandbox: SandboxRuntime,
  state: SandboxWorkbenchState
): void {
  const snapshot = sandbox.snapshot({ selectedActorId: state.selectedActorId });
  const entries =
    state.timelineFilter === "all"
      ? snapshot.timeline
      : snapshot.timeline.filter((entry) => entry.kind === state.timelineFilter);

  for (const filter of handles.timelineFilters) {
    filter.classList.toggle("is-active", filter.dataset.timelineFilter === state.timelineFilter);
  }

  const visibleEntries = entries.slice().reverse().slice(0, 18);

  handles.timelineList.innerHTML = visibleEntries
    .slice()
    .map(
      (entry) => `
      <li class="timeline-entry timeline-entry--${escapeHtml(entry.kind)}" data-timeline-entry="${escapeHtml(entry.id)}">
        <span class="timeline-entry__meta">${escapeHtml(upper(entry.kind))} · ${formatTime(entry.time)}</span>
        <strong class="timeline-entry__label">${escapeHtml(entry.label)}</strong>
        <code>${escapeHtml(entry.source)}</code>
        <span class="timeline-entry__status">${escapeHtml(entry.status ?? "observed")}${entry.actorId ? ` · ${escapeHtml(entry.actorId)}` : ""}</span>
      </li>
    `
    )
    .join("");

  const latestEntry = visibleEntries[0];
  if (!latestEntry || latestEntry.id === handles.lastAnimatedTimelineEntryId) {
    return;
  }

  handles.lastAnimatedTimelineEntryId = latestEntry.id;
  const latestElement = [
    ...handles.timelineList.querySelectorAll<HTMLElement>("[data-timeline-entry]")
  ].find((element) => element.dataset.timelineEntry === latestEntry.id);
  if (latestElement) {
    timelineAnimator.emphasize(latestElement);
  }
}

function formatTime(time: number): string {
  return `${Math.round(time)}ms`;
}
