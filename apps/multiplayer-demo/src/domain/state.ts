import type { MultiplayerDemoCommand, MultiplayerDemoStrategy } from "./commands";

export type MultiplayerDemoObject = {
  id: string;
  label: string;
  kind: "relay" | "cache" | "shield";
  priority: number;
  confirmations: number;
  selected: boolean;
};

export type MultiplayerDemoTimelineEntry = {
  id: number;
  type: "accepted" | "rejected" | "result";
  label: string;
  peerId?: string;
  commandId?: string;
  code?: string;
};

export type MultiplayerDemoState = {
  strategy: MultiplayerDemoStrategy;
  selectedObjectId?: string;
  confirmations: number;
  appliedCommands: number;
  rejectedCommands: number;
  objects: MultiplayerDemoObject[];
  timeline: MultiplayerDemoTimelineEntry[];
};

export type MultiplayerDemoSnapshot = {
  strategy: MultiplayerDemoStrategy;
  selectedObjectId?: string;
  confirmations: number;
  appliedCommands: number;
  rejectedCommands: number;
  objects: MultiplayerDemoObject[];
  timeline: MultiplayerDemoTimelineEntry[];
};

export function createInitialMultiplayerDemoState(): MultiplayerDemoState {
  return {
    strategy: "gather",
    confirmations: 0,
    appliedCommands: 0,
    rejectedCommands: 0,
    objects: [
      {
        id: "relay-alpha",
        label: "Relay Alpha",
        kind: "relay",
        priority: 2,
        confirmations: 0,
        selected: true
      },
      {
        id: "cache-bravo",
        label: "Cache Bravo",
        kind: "cache",
        priority: 1,
        confirmations: 0,
        selected: false
      },
      {
        id: "shield-charlie",
        label: "Shield Charlie",
        kind: "shield",
        priority: 3,
        confirmations: 0,
        selected: false
      }
    ],
    selectedObjectId: "relay-alpha",
    timeline: []
  };
}

export function hasDemoObject(state: MultiplayerDemoState, objectId: string): boolean {
  return state.objects.some((object) => object.id === objectId);
}

export function applyMultiplayerDemoCommand(
  state: MultiplayerDemoState,
  command: MultiplayerDemoCommand
): void {
  state.appliedCommands += 1;

  switch (command.type) {
    case "select":
      selectObject(state, command.objectId);
      return;
    case "confirm":
      confirmObject(state, command.objectId ?? state.selectedObjectId);
      return;
    case "set-strategy":
      state.strategy = command.strategy;
      return;
    case "set-priority":
      setObjectPriority(state, command.objectId, command.priority);
      return;
  }
}

export function recordDemoTimelineEntry(
  state: MultiplayerDemoState,
  input: Omit<MultiplayerDemoTimelineEntry, "id">
): void {
  const latest = state.timeline[0];
  const nextId = latest ? latest.id + 1 : 1;
  state.timeline.unshift({
    id: nextId,
    ...input
  });
  if (state.timeline.length > 16) {
    state.timeline.pop();
  }
}

export function captureMultiplayerDemoSnapshot(
  state: MultiplayerDemoState
): MultiplayerDemoSnapshot {
  return {
    strategy: state.strategy,
    ...(state.selectedObjectId ? { selectedObjectId: state.selectedObjectId } : {}),
    confirmations: state.confirmations,
    appliedCommands: state.appliedCommands,
    rejectedCommands: state.rejectedCommands,
    objects: state.objects.map((object) => ({ ...object })),
    timeline: state.timeline.map((entry) => ({ ...entry }))
  };
}

function selectObject(state: MultiplayerDemoState, objectId: string): void {
  state.selectedObjectId = objectId;
  for (const object of state.objects) {
    object.selected = object.id === objectId;
  }
}

function confirmObject(state: MultiplayerDemoState, objectId: string | undefined): void {
  if (!objectId) {
    return;
  }

  const target = state.objects.find((object) => object.id === objectId);
  if (!target) {
    return;
  }

  target.confirmations += 1;
  state.confirmations += 1;
}

function setObjectPriority(state: MultiplayerDemoState, objectId: string, priority: number): void {
  const target = state.objects.find((object) => object.id === objectId);
  if (target) {
    target.priority = priority;
  }
}
