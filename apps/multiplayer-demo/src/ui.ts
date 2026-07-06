import type { MultiplayerDemoAppSnapshot, MultiplayerDemoCommand } from "./domain";
import type { MultiplayerDemoClient } from "./client";

export type MultiplayerDemoConfig = {
  endpoint: string;
  roomName: string;
  defaultSessionId: string;
  sessions: string[];
};

export type MultiplayerDemoSessionInfo = {
  endpoint: string;
  roomName: string;
  sessionId: string;
  hostPeerId: string;
  snapshot: MultiplayerDemoAppSnapshot;
};

export type MultiplayerDemoUi = {
  root: HTMLElement;
  status: HTMLElement;
  backend: HTMLElement;
  session: HTMLElement;
  peers: HTMLElement;
  sent: HTMLElement;
  received: HTMLElement;
  applied: HTMLElement;
  rejected: HTMLElement;
  strategy: HTMLElement;
  selected: HTMLElement;
  confirmations: HTMLElement;
  objects: HTMLElement;
  timeline: HTMLElement;
  messages: HTMLElement;
  roomInput: HTMLInputElement;
  hostButton: HTMLButtonElement;
  connectButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  selectButtons: HTMLButtonElement[];
  confirmButton: HTMLButtonElement;
  strategyButtons: HTMLButtonElement[];
  priorityButtons: HTMLButtonElement[];
};

export function renderMultiplayerDemoShell(root: HTMLElement): MultiplayerDemoUi {
  root.className = "multiplayer-demo";

  const shell = createElement("section", "multiplayer-demo__shell");
  const main = createElement("section", "multiplayer-demo__main");
  const side = createElement("aside", "multiplayer-demo__side");
  const header = createElement("header", "multiplayer-demo__header");
  const eyebrow = createElement("p", "multiplayer-demo__eyebrow", "GameKit Multiplayer");
  const title = createElement("h1", "multiplayer-demo__title", "Colyseus Loopback Console");
  const status = createElement("p", "multiplayer-demo__status", "Booting demo server");
  header.replaceChildren(eyebrow, title, status);

  const metrics = createElement("section", "multiplayer-demo__metrics");
  const backend = createMetric("Backend");
  const session = createMetric("Session");
  const peers = createMetric("Peers");
  const sent = createMetric("Sent");
  const received = createMetric("Received");
  const applied = createMetric("Applied");
  const rejected = createMetric("Rejected");
  metrics.replaceChildren(
    backend.root,
    session.root,
    peers.root,
    sent.root,
    received.root,
    applied.root,
    rejected.root
  );

  const controls = createElement("section", "multiplayer-demo__controls");
  const roomInput = createRoomInput();
  const hostButton = createButton("Host Room");
  const connectButton = createButton("Connect Client", "multiplayer-demo__primary");
  const disconnectButton = createButton("Disconnect Client");
  const resetButton = createButton("Reset Room");
  const confirmButton = createButton("Confirm Target", "multiplayer-demo__primary");
  const selectButtons = ["relay-alpha", "cache-bravo", "shield-charlie"].map((objectId) =>
    createButton(objectId)
  );
  const strategyButtons = ["gather", "build", "defend"].map((strategy) => createButton(strategy));
  const priorityButtons = ["0", "2", "5", "99"].map((priority) => createButton(`P${priority}`));

  controls.replaceChildren(
    createElement("h2", "multiplayer-demo__section-title", "Client Commands"),
    createRoomControls(roomInput, [hostButton, connectButton, disconnectButton, resetButton]),
    createButtonGroup("Select", selectButtons),
    confirmButton,
    createButtonGroup("Strategy", strategyButtons),
    createButtonGroup("Priority", priorityButtons)
  );

  const statePanel = createElement("section", "multiplayer-demo__state");
  const strategy = createMetric("Strategy");
  const selected = createMetric("Selected");
  const confirmations = createMetric("Confirms");
  const objects = createElement("div", "multiplayer-demo__objects");
  statePanel.replaceChildren(
    createElement("h2", "multiplayer-demo__section-title", "Host State"),
    strategy.root,
    selected.root,
    confirmations.root,
    objects
  );

  const timeline = createElement("ol", "multiplayer-demo__timeline");
  const messages = createElement("ol", "multiplayer-demo__messages");
  side.replaceChildren(
    createElement("h2", "multiplayer-demo__section-title", "Authority Timeline"),
    timeline,
    createElement("h2", "multiplayer-demo__section-title", "Client Messages"),
    messages
  );

  main.replaceChildren(header, metrics, controls, statePanel);
  shell.replaceChildren(main, side);
  root.replaceChildren(shell);

  return {
    root,
    status,
    backend: backend.value,
    session: session.value,
    peers: peers.value,
    sent: sent.value,
    received: received.value,
    applied: applied.value,
    rejected: rejected.value,
    strategy: strategy.value,
    selected: selected.value,
    confirmations: confirmations.value,
    objects,
    timeline,
    messages,
    roomInput,
    hostButton,
    connectButton,
    disconnectButton,
    resetButton,
    selectButtons,
    confirmButton,
    strategyButtons,
    priorityButtons
  };
}

export function bindMultiplayerDemoControls(
  ui: MultiplayerDemoUi,
  actions: {
    host(): void;
    connect(): void;
    disconnect(): void;
    reset(): void;
    command(command: MultiplayerDemoCommand): void;
  }
): void {
  ui.hostButton.addEventListener("click", actions.host);
  ui.connectButton.addEventListener("click", actions.connect);
  ui.disconnectButton.addEventListener("click", actions.disconnect);
  ui.resetButton.addEventListener("click", actions.reset);
  ui.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      actions.host();
    }
  });
  for (const button of ui.selectButtons) {
    button.addEventListener("click", () => {
      actions.command({ type: "select", objectId: button.textContent ?? "relay-alpha" });
    });
  }
  ui.confirmButton.addEventListener("click", () => {
    actions.command({ type: "confirm" });
  });
  for (const button of ui.strategyButtons) {
    button.addEventListener("click", () => {
      const strategy = button.textContent;
      if (strategy === "gather" || strategy === "build" || strategy === "defend") {
        actions.command({ type: "set-strategy", strategy });
      }
    });
  }
  for (const button of ui.priorityButtons) {
    button.addEventListener("click", () => {
      const priority = Number((button.textContent ?? "P2").replace("P", ""));
      actions.command({ type: "set-priority", objectId: "relay-alpha", priority });
    });
  }
}

export function renderServerReady(ui: MultiplayerDemoUi, config: MultiplayerDemoConfig): void {
  ui.status.textContent = "Server ready";
  ui.backend.textContent = "colyseus";
  ui.session.textContent = ui.roomInput.value.trim() || config.defaultSessionId;
  ui.peers.textContent = "0";
  ui.peers.title = "0 active / 0 tracked";
  ui.sent.textContent = "0";
  ui.received.textContent = "0";
  ui.applied.textContent = "0";
  ui.rejected.textContent = "0";
  ui.strategy.textContent = "none";
  ui.selected.textContent = "none";
  ui.confirmations.textContent = "0";
  ui.objects.replaceChildren();
  ui.timeline.replaceChildren();
}

export function renderSessionInfo(ui: MultiplayerDemoUi, info: MultiplayerDemoSessionInfo): void {
  ui.status.textContent = "Room hosted";
  renderSnapshot(ui, info.snapshot);
}

export function renderClientState(
  ui: MultiplayerDemoUi,
  client: MultiplayerDemoClient | undefined,
  options: { activeSessionId?: string; selectedSessionId?: string; busy?: boolean } = {}
): void {
  const clientSessionId = client?.runtime.session()?.id;
  const connectedToSelectedSession =
    client?.runtime.phase() === "in-session" &&
    options.selectedSessionId !== undefined &&
    options.selectedSessionId.length > 0 &&
    clientSessionId === options.selectedSessionId;
  const busy = options.busy === true;

  ui.hostButton.disabled = busy;
  ui.connectButton.disabled = busy || connectedToSelectedSession;
  ui.disconnectButton.disabled = busy || client === undefined;
  ui.resetButton.disabled = busy;
  ui.confirmButton.disabled = busy;
  for (const button of [...ui.selectButtons, ...ui.strategyButtons, ...ui.priorityButtons]) {
    button.disabled = busy;
  }
  ui.messages.replaceChildren();

  for (const message of [...(client?.messages ?? [])].reverse().slice(0, 8)) {
    const item = createElement("li", "multiplayer-demo__message");
    const title = createElement("strong", undefined, message.kind);
    const detail = createElement(
      "span",
      undefined,
      `${message.sourcePeerId} -> ${message.targetPeerIds?.join(",") ?? "broadcast"}`
    );
    item.replaceChildren(title, detail);
    ui.messages.append(item);
  }
}

export function renderSnapshot(ui: MultiplayerDemoUi, snapshot: MultiplayerDemoAppSnapshot): void {
  const activePeers = snapshot.multiplayer.peers.filter((peer) =>
    isActivePeerStatus(peer.status)
  ).length;

  ui.backend.textContent = snapshot.multiplayer.backendId;
  ui.session.textContent = snapshot.multiplayer.session?.id ?? "none";
  ui.peers.textContent = String(activePeers);
  ui.peers.title = `${activePeers} active / ${snapshot.multiplayer.peers.length} tracked`;
  ui.sent.textContent = String(snapshot.multiplayer.sent);
  ui.received.textContent = String(snapshot.multiplayer.received);
  ui.applied.textContent = String(snapshot.state.appliedCommands);
  ui.rejected.textContent = String(snapshot.state.rejectedCommands);
  ui.strategy.textContent = snapshot.state.strategy;
  ui.selected.textContent = snapshot.state.selectedObjectId ?? "none";
  ui.confirmations.textContent = String(snapshot.state.confirmations);

  ui.objects.replaceChildren();
  for (const object of snapshot.state.objects) {
    const row = createElement("div", "multiplayer-demo__object");
    if (object.selected) {
      row.classList.add("is-selected");
    }
    row.replaceChildren(
      createElement("strong", undefined, object.label),
      createElement("span", undefined, object.kind),
      createElement("span", undefined, `P${object.priority}`),
      createElement("span", undefined, `${object.confirmations} confirms`)
    );
    ui.objects.append(row);
  }

  ui.timeline.replaceChildren();
  for (const entry of snapshot.state.timeline) {
    const item = createElement("li", `multiplayer-demo__timeline-item is-${entry.type}`);
    const title = createElement("strong", undefined, entry.label);
    const detail = createElement("span", undefined, entry.code ?? entry.peerId ?? "host");
    item.replaceChildren(title, detail);
    ui.timeline.append(item);
  }
}

export function renderBootError(root: HTMLElement, error: unknown): void {
  root.className = "multiplayer-demo";
  const panel = createElement("section", "multiplayer-demo__boot-error");
  panel.replaceChildren(
    createElement("h1", undefined, "Multiplayer demo failed to boot"),
    createElement("p", undefined, error instanceof Error ? error.message : String(error))
  );
  root.replaceChildren(panel);
}

function createMetric(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = createElement("div", "multiplayer-demo__metric");
  const labelElement = createElement("span", undefined, label);
  const value = createElement("strong", undefined, "...");
  root.replaceChildren(labelElement, value);
  return { root, value };
}

function createRoomControls(
  roomInput: HTMLInputElement,
  buttons: HTMLButtonElement[]
): HTMLElement {
  const group = createElement("div", "multiplayer-demo__room-controls");
  const label = document.createElement("label");
  label.className = "multiplayer-demo__room-label";
  label.htmlFor = roomInput.id;
  label.textContent = "Room";
  const buttonRow = createElement("div", "multiplayer-demo__room-buttons");
  buttonRow.replaceChildren(...buttons);
  group.replaceChildren(label, roomInput, buttonRow);
  return group;
}

function createRoomInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.id = "multiplayer-demo-room";
  input.className = "multiplayer-demo__room-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 48;
  input.placeholder = "multiplayer-demo-session";
  return input;
}

function createButtonGroup(label: string, buttons: HTMLButtonElement[]): HTMLElement {
  const group = createElement("div", "multiplayer-demo__button-group");
  group.replaceChildren(createElement("span", undefined, label), ...buttons);
  return group;
}

function createButton(label: string, className?: string): HTMLButtonElement {
  const button = document.createElement("button");
  if (className) {
    button.className = className;
  }
  button.type = "button";
  button.textContent = label;
  return button;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function isActivePeerStatus(status: string): boolean {
  return status === "joining" || status === "connected" || status === "ready";
}
