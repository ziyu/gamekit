import type { ArenaSnapshot } from "../shared/protocol";

export type ArenaUi = {
  root: HTMLElement;
  viewport: HTMLElement;
  sessionInput: HTMLInputElement;
  nameInput: HTMLInputElement;
  createButton: HTMLButtonElement;
  joinButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  phase: HTMLElement;
  timer: HTMLElement;
  connection: HTMLElement;
  localPlayer: HTMLElement;
  diagnostics: HTMLElement;
  hint: HTMLElement;
  log: HTMLOListElement;
  setConnection(status: "offline" | "connecting" | "online" | "error", detail: string): void;
  setBusy(busy: boolean): void;
  pushLog(message: string): void;
};

export function renderArenaUi(root: HTMLElement): ArenaUi {
  root.className = "arena-app";
  const shell = element("section", "arena-shell");
  const masthead = element("header", "arena-masthead");
  const brand = element("div", "arena-brand");
  brand.append(
    element("span", "arena-brand__flag", "GK // LIVE"),
    element("h1", "arena-brand__title", "KNOCKOUT CIRCUIT"),
    element("p", "arena-brand__sub", "SERVER AUTHORITY · FULL-ISLAND ROLLBACK")
  );
  const phase = element("strong", "arena-scoreboard__phase", "OFFLINE");
  const timer = element("span", "arena-scoreboard__timer", "--:--");
  const scoreboard = element("div", "arena-scoreboard");
  scoreboard.append(phase, timer);
  masthead.append(brand, scoreboard);

  const stage = element("section", "arena-stage");
  const viewport = element("div", "arena-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Knockout Circuit 3D game viewport");
  const crosshair = element("div", "arena-crosshair");
  crosshair.setAttribute("aria-hidden", "true");
  const hint = element("p", "arena-hint", "WASD / ARROWS TO RUN · SPACE TO JUMP");
  viewport.append(crosshair, hint);

  const rail = element("aside", "arena-rail");
  const connectPanel = panel("SESSION LINK");
  const sessionInput = input("text", "knockout-arena", "Session code");
  sessionInput.maxLength = 32;
  const nameInput = input("text", randomName(), "Display name");
  nameInput.maxLength = 18;
  const fieldGrid = element("div", "arena-fields");
  fieldGrid.append(field("CODE", sessionInput), field("CALLSIGN", nameInput));
  const createButton = button("CREATE", "is-primary");
  const joinButton = button("JOIN");
  const disconnectButton = button("DISCONNECT", "is-quiet");
  disconnectButton.disabled = true;
  const actions = element("div", "arena-actions");
  actions.append(createButton, joinButton, disconnectButton);
  const connection = element("p", "arena-connection is-offline", "AUTHORITY OFFLINE");
  const localPlayer = element("p", "arena-local-player", "LOCAL SLOT · UNBOUND");
  connectPanel.body.append(fieldGrid, actions, connection, localPlayer);

  const diagnosticsPanel = panel("ROLLBACK TELEMETRY");
  const diagnostics = element("pre", "arena-diagnostics", "Awaiting authority frame…");
  diagnosticsPanel.body.append(diagnostics);

  const logPanel = panel("RACE CONTROL");
  const log = element("ol", "arena-log") as HTMLOListElement;
  logPanel.body.append(log);
  rail.append(connectPanel.root, diagnosticsPanel.root, logPanel.root);
  stage.append(viewport, rail);

  const footer = element("footer", "arena-footer");
  footer.append(
    element("span", undefined, "60 HZ PHYSICS"),
    element("span", undefined, "20 HZ AUTHORITY FRAME"),
    element("span", undefined, "RAPIER3D / COLYSEUS / THREE")
  );
  shell.append(masthead, stage, footer);
  root.replaceChildren(shell);

  const ui: ArenaUi = {
    root,
    viewport,
    sessionInput,
    nameInput,
    createButton,
    joinButton,
    disconnectButton,
    phase,
    timer,
    connection,
    localPlayer,
    diagnostics,
    hint,
    log,
    setConnection(status, detail) {
      connection.className = `arena-connection is-${status}`;
      connection.textContent = detail;
    },
    setBusy(busy) {
      createButton.disabled = busy;
      joinButton.disabled = busy;
      disconnectButton.disabled = busy || connection.classList.contains("is-offline");
      sessionInput.disabled = busy;
      nameInput.disabled = busy;
    },
    pushLog(message) {
      const item = element("li", undefined, message);
      const time = new Date().toLocaleTimeString([], { hour12: false });
      item.dataset.time = time;
      log.prepend(item);
      while (log.childElementCount > 8) log.lastElementChild?.remove();
    }
  };
  return ui;
}

export function updateArenaUi(
  ui: ArenaUi,
  snapshot: ArenaSnapshot | undefined,
  localMemberId: string | undefined,
  telemetry: Record<string, unknown>
): void {
  if (!snapshot) {
    ui.phase.textContent = "LINKING";
    ui.timer.textContent = "--:--";
    ui.diagnostics.textContent = JSON.stringify(telemetry, null, 2);
    return;
  }
  ui.phase.textContent = snapshot.phase.toUpperCase();
  const timeMs =
    snapshot.phase === "countdown"
      ? snapshot.countdownMs
      : Math.max(0, 120_000 - snapshot.roundTimeMs);
  ui.timer.textContent = formatTime(timeMs);
  ui.localPlayer.textContent = `LOCAL SLOT · ${localMemberId ?? "SPECTATOR"}`;
  ui.viewport.dataset.phase = snapshot.phase;
  ui.hint.textContent =
    snapshot.phase === "countdown"
      ? `ROUND ${snapshot.round} · HOLD YOUR LINE`
      : snapshot.phase === "results"
        ? `${snapshot.winnerId ?? "NO SURVIVOR"} TAKES THE HEAT`
        : "WASD / ARROWS TO RUN · SPACE TO JUMP";
  ui.diagnostics.textContent = JSON.stringify(telemetry, null, 2);
}

function panel(title: string): { root: HTMLElement; body: HTMLElement } {
  const root = element("section", "arena-panel");
  const heading = element("h2", "arena-panel__title", title);
  const body = element("div", "arena-panel__body");
  root.append(heading, body);
  return { root, body };
}

function field(label: string, control: HTMLElement): HTMLElement {
  const root = element("label", "arena-field");
  root.append(element("span", undefined, label), control);
  return root;
}

function input(type: string, value: string, label: string): HTMLInputElement {
  const target = document.createElement("input");
  target.type = type;
  target.value = value;
  target.setAttribute("aria-label", label);
  target.autocomplete = "off";
  return target;
}

function button(label: string, modifier?: string): HTMLButtonElement {
  const target = document.createElement("button");
  target.type = "button";
  target.className = `arena-button${modifier ? ` ${modifier}` : ""}`;
  target.textContent = label;
  return target;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const target = document.createElement(tag);
  if (className) target.className = className;
  if (text !== undefined) target.textContent = text;
  return target;
}

function formatTime(value: number): string {
  if (value <= 3_000) return `${(value / 1000).toFixed(1)}S`;
  const total = Math.ceil(value / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function randomName(): string {
  const names = ["TURBO BEAN", "NIGHT COMET", "RAMP RAT", "PUSH UNIT", "SOFT IMPACT"];
  return names[Math.floor(Math.random() * names.length)] ?? "TURBO BEAN";
}
