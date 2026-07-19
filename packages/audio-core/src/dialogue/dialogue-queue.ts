import type { DialogueLineDefinition } from "./dialogue-line-definition";
import type { DialogueQueueOptions } from "./dialogue-player";
import type { DialogueItemState } from "./dialogue-state";

export type DialogueQueueItem = {
  definition: DialogueLineDefinition;
  options: DialogueQueueOptions;
  state: DialogueItemState;
};

export type DialogueQueue = {
  add(item: DialogueQueueItem): void;
  next(): DialogueQueueItem | undefined;
  remove(id: string): DialogueQueueItem | undefined;
  removeSpeaker(speakerId: string): DialogueQueueItem[];
  values(): DialogueQueueItem[];
  clear(): DialogueQueueItem[];
};

export function createDialogueQueue(): DialogueQueue {
  const items: DialogueQueueItem[] = [];
  return {
    add(item) {
      items.push(item);
      items.sort(
        (left, right) =>
          right.state.priority - left.state.priority ||
          left.state.queuedAt - right.state.queuedAt ||
          left.state.id.localeCompare(right.state.id)
      );
    },
    next: () => items.shift(),
    remove(id) {
      const index = items.findIndex((item) => item.state.id === id);
      return index < 0 ? undefined : items.splice(index, 1)[0];
    },
    removeSpeaker(speakerId) {
      const removed = items.filter((item) => item.state.speakerId === speakerId);
      for (const item of removed) {
        const index = items.indexOf(item);
        if (index >= 0) {
          items.splice(index, 1);
        }
      }
      return removed;
    },
    values: () => [...items],
    clear: () => items.splice(0, items.length)
  };
}
