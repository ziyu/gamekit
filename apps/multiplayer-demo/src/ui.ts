import type { MultiplayerDemoAppSnapshot } from "./domain";
import type { MultiplayerDemoClient } from "./client";
import type { RealtimeArenaSnapshot, RealtimeArenaState } from "./realtime/domain";
import type { RealtimeLocalGameDiagnostics } from "./realtime/local-game";

type RealtimeArenaViewState = RealtimeArenaState | RealtimeArenaSnapshot;

export type MultiplayerDemoRunMode =
  | "local-offline"
  | "host"
  | "client"
  | "host-not-joined"
  | "hosted-not-joined";

export type MultiplayerDemoRoomControls = {
  host: boolean;
  join: boolean;
  leave: boolean;
  resetRoom: boolean;
};

export type MultiplayerDemoJoinRole = "host" | "client";

export type RealtimeArenaControlPermissions = {
  ready: boolean;
  startRound: boolean;
  rematch: boolean;
  resetArena: boolean;
};

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
  mode: HTMLElement;
  backend: HTMLElement;
  session: HTMLElement;
  peers: HTMLElement;
  sent: HTMLElement;
  received: HTMLElement;
  applied: HTMLElement;
  rejected: HTMLElement;
  timeline: HTMLElement;
  messages: HTMLElement;
  playerNameInput: HTMLInputElement;
  roomInput: HTMLInputElement;
  hostButton: HTMLButtonElement;
  connectButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  arenaCanvas: HTMLCanvasElement;
  arenaPhase: HTMLElement;
  arenaTimer: HTMLElement;
  arenaScore: HTMLElement;
  arenaPlayer: HTMLElement;
  arenaInput: HTMLElement;
  arenaHint: HTMLElement;
  readyButton: HTMLButtonElement;
  startRoundButton: HTMLButtonElement;
  rematchButton: HTMLButtonElement;
  resetArenaButton: HTMLButtonElement;
};

export function renderMultiplayerDemoShell(root: HTMLElement): MultiplayerDemoUi {
  root.className = "multiplayer-demo";

  const shell = createElement("section", "multiplayer-demo__shell");
  const main = createElement("section", "multiplayer-demo__main");
  const side = createElement("aside", "multiplayer-demo__side");
  const header = createElement("header", "multiplayer-demo__header");
  const eyebrow = createElement("p", "multiplayer-demo__eyebrow", "GameKit Multiplayer");
  const title = createElement("h1", "multiplayer-demo__title", "Relay Arena");
  const status = createElement("p", "multiplayer-demo__status", "Booting demo server");
  header.replaceChildren(eyebrow, title, status);

  const arena = createRealtimeArenaPanel();

  const metrics = createElement("section", "multiplayer-demo__metrics");
  const mode = createMetric("Mode");
  const backend = createMetric("Backend");
  const session = createMetric("Session");
  const peers = createMetric("Peers");
  const sent = createMetric("Sent");
  const received = createMetric("Received");
  const applied = createMetric("Accepted");
  const rejected = createMetric("Rejected");
  metrics.replaceChildren(
    mode.root,
    backend.root,
    session.root,
    peers.root,
    sent.root,
    received.root,
    applied.root,
    rejected.root
  );

  const controls = createElement("section", "multiplayer-demo__controls");
  const playerNameInput = createPlayerNameInput();
  const roomInput = createRoomInput();
  const hostButton = createButton("Host & Join");
  const connectButton = createButton("Join", "multiplayer-demo__primary");
  const disconnectButton = createButton("Leave");
  const resetButton = createButton("Reset");

  controls.replaceChildren(
    createElement("h2", "multiplayer-demo__section-title", "Room"),
    createRoomControls(playerNameInput, roomInput, [
      hostButton,
      connectButton,
      disconnectButton,
      resetButton
    ])
  );

  const timeline = createElement("ol", "multiplayer-demo__timeline");
  const messages = createElement("ol", "multiplayer-demo__messages");
  const eventsPanel = createElement("section", "multiplayer-demo__feed-panel");
  eventsPanel.replaceChildren(
    createElement("h2", "multiplayer-demo__section-title", "Events"),
    timeline
  );
  const messagesPanel = createElement("section", "multiplayer-demo__feed-panel");
  messagesPanel.replaceChildren(
    createElement("h2", "multiplayer-demo__section-title", "Messages"),
    messages
  );
  side.replaceChildren(controls, metrics, eventsPanel, messagesPanel);

  main.replaceChildren(header, arena.root);
  shell.replaceChildren(main, side);
  root.replaceChildren(shell);

  return {
    root,
    status,
    mode: mode.value,
    backend: backend.value,
    session: session.value,
    peers: peers.value,
    sent: sent.value,
    received: received.value,
    applied: applied.value,
    rejected: rejected.value,
    timeline,
    messages,
    playerNameInput,
    roomInput,
    hostButton,
    connectButton,
    disconnectButton,
    resetButton,
    arenaCanvas: arena.canvas,
    arenaPhase: arena.phase,
    arenaTimer: arena.timer,
    arenaScore: arena.score,
    arenaPlayer: arena.player,
    arenaInput: arena.input,
    arenaHint: arena.hint,
    readyButton: arena.readyButton,
    startRoundButton: arena.startRoundButton,
    rematchButton: arena.rematchButton,
    resetArenaButton: arena.resetArenaButton
  };
}

export function bindMultiplayerDemoControls(
  ui: MultiplayerDemoUi,
  actions: {
    host(): void;
    connect(): void;
    disconnect(): void;
    reset(): void;
  }
): void {
  ui.hostButton.addEventListener("click", actions.host);
  ui.connectButton.addEventListener("click", actions.connect);
  ui.disconnectButton.addEventListener("click", actions.disconnect);
  ui.resetButton.addEventListener("click", actions.reset);
  ui.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !ui.hostButton.disabled) {
      actions.host();
    }
  });
}

export function bindRealtimeArenaControls(
  ui: MultiplayerDemoUi,
  actions: {
    ready(): void;
    startRound(): void;
    rematch(): void;
    resetArena(): void;
  }
): void {
  ui.readyButton.addEventListener("click", actions.ready);
  ui.startRoundButton.addEventListener("click", actions.startRound);
  ui.rematchButton.addEventListener("click", actions.rematch);
  ui.resetArenaButton.addEventListener("click", actions.resetArena);
}

export function renderServerReady(ui: MultiplayerDemoUi, config: MultiplayerDemoConfig): void {
  ui.status.textContent = "Server ready";
  ui.mode.textContent = runModeLabel("local-offline");
  ui.backend.textContent = "colyseus";
  ui.session.textContent = ui.roomInput.value.trim() || config.defaultSessionId;
  ui.peers.textContent = "0";
  ui.peers.title = "0 active / 0 tracked";
  ui.sent.textContent = "0";
  ui.received.textContent = "0";
  ui.applied.textContent = "0";
  ui.rejected.textContent = "0";
  ui.timeline.replaceChildren();
}

export function renderSessionInfo(ui: MultiplayerDemoUi, info: MultiplayerDemoSessionInfo): void {
  ui.status.textContent = "Room hosted";
  renderSnapshot(ui, info.snapshot);
}

export function renderClientState(
  ui: MultiplayerDemoUi,
  client: MultiplayerDemoClient | undefined,
  options: {
    activeSessionId?: string;
    selectedSessionId?: string;
    busy?: boolean;
    mode: MultiplayerDemoRunMode;
  }
): void {
  const busy = options.busy === true;
  const controls = resolveMultiplayerDemoRoomControls(options.mode, busy);

  ui.root.dataset.multiplayerMode = options.mode;
  ui.mode.textContent = runModeLabel(options.mode);
  ui.disconnectButton.textContent = options.mode === "host" ? "Close Host" : "Leave";
  ui.hostButton.disabled = !controls.host;
  ui.connectButton.disabled = !controls.join;
  ui.disconnectButton.disabled = !controls.leave || client === undefined;
  ui.resetButton.disabled = !controls.resetRoom;
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

export function renderRealtimeArenaUi(
  ui: MultiplayerDemoUi,
  state: RealtimeArenaViewState,
  diagnostics: RealtimeLocalGameDiagnostics,
  localPlayerId: string,
  permissions: RealtimeArenaControlPermissions = resolveRealtimeArenaControlPermissions(
    "local-offline"
  )
): void {
  const localPlayer = state.players.find((player) => player.id === localPlayerId);
  ui.arenaPhase.textContent = state.phase;
  ui.arenaTimer.textContent = formatRoundTime(state);
  ui.arenaScore.textContent = formatScore(state.score);
  ui.arenaPlayer.textContent =
    localPlayer === undefined
      ? "none"
      : `${localPlayer.label} / ${localPlayer.teamId} / ${localPlayer.carryingCoreId ?? "empty"} / ${localPlayer.deliveredCores}`;
  ui.arenaInput.textContent = `${diagnostics.inputSequence} / ${diagnostics.inputSendRate}hz / ${diagnostics.serverTickRate}tps`;
  ui.arenaHint.textContent = arenaHint(state, diagnostics);

  ui.readyButton.disabled = !permissions.ready || state.phase !== "lobby";
  ui.readyButton.textContent = localPlayer?.ready ? "Unready" : "Ready";
  ui.startRoundButton.disabled =
    !permissions.startRound || state.phase !== "lobby" || localPlayer?.ready !== true;
  ui.rematchButton.disabled = !permissions.rematch || state.phase !== "results";
  ui.resetArenaButton.disabled = !permissions.resetArena;

  ui.timeline.replaceChildren();
  for (const entry of [...state.events].reverse().slice(0, 12)) {
    const item = createElement("li", `multiplayer-demo__timeline-item is-${eventTone(entry.type)}`);
    const title = createElement("strong", undefined, entry.label);
    const detail = createElement(
      "span",
      undefined,
      entry.code ?? entry.teamId ?? entry.playerId ?? "round"
    );
    item.replaceChildren(title, detail);
    ui.timeline.append(item);
  }
}

export function resolveMultiplayerDemoRoomControls(
  mode: MultiplayerDemoRunMode,
  busy = false
): MultiplayerDemoRoomControls {
  if (busy) {
    return {
      host: false,
      join: false,
      leave: false,
      resetRoom: false
    };
  }

  switch (mode) {
    case "local-offline":
      return {
        host: true,
        join: true,
        leave: false,
        resetRoom: false
      };
    case "host":
      return {
        host: false,
        join: false,
        leave: true,
        resetRoom: true
      };
    case "client":
      return {
        host: false,
        join: false,
        leave: true,
        resetRoom: false
      };
    case "host-not-joined":
      return {
        host: false,
        join: true,
        leave: false,
        resetRoom: true
      };
    case "hosted-not-joined":
      return {
        host: false,
        join: true,
        leave: false,
        resetRoom: false
      };
  }
}

export function resolveMultiplayerDemoJoinRole(
  mode: MultiplayerDemoRunMode
): MultiplayerDemoJoinRole {
  return mode === "host-not-joined" ? "host" : "client";
}

export function resolveRealtimeArenaControlPermissions(
  mode: MultiplayerDemoRunMode
): RealtimeArenaControlPermissions {
  switch (mode) {
    case "local-offline":
    case "host":
      return {
        ready: true,
        startRound: true,
        rematch: true,
        resetArena: true
      };
    case "client":
      return {
        ready: true,
        startRound: false,
        rematch: false,
        resetArena: false
      };
    case "host-not-joined":
    case "hosted-not-joined":
      return {
        ready: false,
        startRound: false,
        rematch: false,
        resetArena: false
      };
  }
}

export function runModeLabel(mode: MultiplayerDemoRunMode): string {
  switch (mode) {
    case "local-offline":
      return "local offline";
    case "host":
      return "host";
    case "client":
      return "client";
    case "host-not-joined":
      return "host / not joined";
    case "hosted-not-joined":
      return "not joined";
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

function createRealtimeArenaPanel(): {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  phase: HTMLElement;
  timer: HTMLElement;
  score: HTMLElement;
  player: HTMLElement;
  input: HTMLElement;
  hint: HTMLElement;
  readyButton: HTMLButtonElement;
  startRoundButton: HTMLButtonElement;
  rematchButton: HTMLButtonElement;
  resetArenaButton: HTMLButtonElement;
} {
  const root = createElement("section", "multiplayer-demo__arena");
  const stage = createElement("div", "multiplayer-demo__arena-stage");
  const canvas = document.createElement("canvas");
  canvas.className = "multiplayer-demo__arena-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Relay Arena");
  const hud = createElement("div", "multiplayer-demo__arena-hud");
  const phase = createHudMetric("Phase");
  const timer = createHudMetric("Timer");
  const score = createHudMetric("Score");
  const player = createHudMetric("Runner");
  const input = createHudMetric("Input");
  hud.replaceChildren(phase.root, timer.root, score.root, player.root, input.root);
  stage.replaceChildren(canvas, hud);

  const controls = createElement("div", "multiplayer-demo__round-controls");
  const readyButton = createButton("Ready");
  const startRoundButton = createButton("Start Round", "multiplayer-demo__primary");
  const rematchButton = createButton("Rematch");
  const resetArenaButton = createButton("Reset Arena");
  controls.replaceChildren(readyButton, startRoundButton, rematchButton, resetArenaButton);
  const hint = createElement("p", "multiplayer-demo__arena-hint", "Local arena ready");
  root.replaceChildren(stage, controls, hint);

  return {
    root,
    canvas,
    phase: phase.value,
    timer: timer.value,
    score: score.value,
    player: player.value,
    input: input.value,
    hint,
    readyButton,
    startRoundButton,
    rematchButton,
    resetArenaButton
  };
}

function createHudMetric(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = createElement("div", "multiplayer-demo__hud-metric");
  const labelElement = createElement("span", undefined, label);
  const value = createElement("strong", undefined, "...");
  root.replaceChildren(labelElement, value);
  return { root, value };
}

function createRoomControls(
  playerNameInput: HTMLInputElement,
  roomInput: HTMLInputElement,
  buttons: HTMLButtonElement[]
): HTMLElement {
  const group = createElement("div", "multiplayer-demo__room-controls");
  const playerLabel = document.createElement("label");
  playerLabel.className = "multiplayer-demo__room-label";
  playerLabel.htmlFor = playerNameInput.id;
  playerLabel.textContent = "Player";
  const label = document.createElement("label");
  label.className = "multiplayer-demo__room-label";
  label.htmlFor = roomInput.id;
  label.textContent = "Room";
  const buttonRow = createElement("div", "multiplayer-demo__room-buttons");
  buttonRow.replaceChildren(...buttons);
  group.replaceChildren(playerLabel, playerNameInput, label, roomInput, buttonRow);
  return group;
}

function createPlayerNameInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.id = "multiplayer-demo-player-name";
  input.className = "multiplayer-demo__room-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 18;
  input.placeholder = "Runner";
  return input;
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

function formatRoundTime(state: RealtimeArenaViewState): string {
  if (state.phase === "running") {
    return formatMilliseconds(Math.max(0, state.rules.roundDurationMs - state.roundElapsedMs));
  }
  if (state.phase === "countdown") {
    return formatMilliseconds(Math.max(0, state.rules.countdownMs - state.phaseElapsedMs));
  }
  if (state.phase === "ending") {
    return formatMilliseconds(Math.max(0, state.rules.endingDurationMs - state.phaseElapsedMs));
  }
  return formatMilliseconds(state.rules.roundDurationMs);
}

function formatMilliseconds(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatScore(score: Record<string, number>): string {
  return Object.entries(score)
    .map(([teamId, value]) => `${teamId}:${value}`)
    .join(" ");
}

function arenaHint(
  state: RealtimeArenaViewState,
  diagnostics: RealtimeLocalGameDiagnostics
): string {
  if (diagnostics.lastAction && !diagnostics.lastAction.accepted) {
    return diagnostics.lastAction.reason;
  }
  if (state.phase === "results") {
    if (state.result?.winnerTeamId) {
      return `${state.result.winnerTeamId} wins in ${formatMilliseconds(state.result.durationMs)}`;
    }
    return "Draw";
  }
  if (state.phase === "lobby") {
    return "Lobby ready";
  }
  if (state.phase === "countdown") {
    return "Countdown";
  }
  if (state.phase === "ending") {
    return "Ending";
  }
  return "Running";
}

function eventTone(type: string): string {
  if (type === "input.rejected") {
    return "rejected";
  }
  if (type === "core.delivered" || type === "round.results") {
    return "result";
  }
  return "accepted";
}

function isActivePeerStatus(status: string): boolean {
  return status === "joining" || status === "connected" || status === "ready";
}
