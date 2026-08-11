import type { ArenaSnapshot } from "../shared/protocol";
import type { ArenaEffectPresentationEvent } from "./arena-effects";

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
  round: HTMLElement;
  position: HTMLElement;
  progress: HTMLElement;
  progressFill: HTMLElement;
  roster: HTMLElement;
  authorityTick: HTMLElement;
  replayTicks: HTMLElement;
  pendingInputs: HTMLElement;
  effectState: HTMLElement;
  payloadSize: HTMLElement;
  effectFlash: HTMLElement;
  setConnection(status: "offline" | "connecting" | "online" | "error", detail: string): void;
  setBusy(busy: boolean): void;
  pushLog(message: string): void;
  showEffect(event: ArenaEffectPresentationEvent): void;
};

export function renderArenaUi(root: HTMLElement): ArenaUi {
  root.className = "arena-app";
  root.dataset.connection = "offline";

  const shell = element("section", "arena-shell");
  const viewport = element("div", "arena-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Knockout Circuit 3D game viewport");

  const atmosphere = element("div", "arena-atmosphere");
  const scanline = element("div", "arena-scanline");
  const effectFlash = element("div", "arena-effect-flash");
  atmosphere.setAttribute("aria-hidden", "true");
  scanline.setAttribute("aria-hidden", "true");
  effectFlash.setAttribute("aria-hidden", "true");

  const broadcast = element("header", "arena-broadcast");
  const brand = element("div", "arena-brand");
  const brandMark = element("span", "arena-brand__mark", "GK");
  const brandCopy = element("div", "arena-brand__copy");
  brandCopy.append(
    element("span", "arena-brand__eyebrow", "LIVE FROM THE SIMULATION"),
    element("h1", "arena-brand__title", "KNOCKOUT CIRCUIT")
  );
  brand.append(brandMark, brandCopy);

  const scoreboard = element("div", "arena-scoreboard");
  const round = element("span", "arena-scoreboard__round", "ROUND 01");
  const phase = element("strong", "arena-scoreboard__phase", "STANDBY");
  const timer = element("span", "arena-scoreboard__timer", "--:--");
  scoreboard.append(round, phase, timer);

  const signal = element("div", "arena-signal");
  signal.append(
    element("span", "arena-signal__dot"),
    element("span", undefined, "AUTHORITY OFFLINE")
  );
  broadcast.append(brand, scoreboard, signal);

  const raceHud = element("section", "arena-race-hud");
  const positionLabel = element("span", "arena-race-hud__label", "CURRENT POSITION");
  const position = element("strong", "arena-race-hud__position", "-- / --");
  const roster = element("span", "arena-race-hud__roster", "WAITING FOR GRID");
  const progressTrack = element("div", "arena-progress");
  const progressFill = element("span", "arena-progress__fill");
  const progress = element("span", "arena-progress__value", "0%");
  progressTrack.append(progressFill);
  raceHud.append(positionLabel, position, roster, progressTrack, progress);

  const hint = element("p", "arena-hint");
  hint.append(
    keycap("WASD"),
    element("span", undefined, "RUN"),
    keycap("SPACE"),
    element("span", undefined, "JUMP"),
    keycap("E"),
    element("span", undefined, "GRAB"),
    keycap("F"),
    element("span", undefined, "USE"),
    keycap("Q"),
    element("span", undefined, "DROP")
  );

  const sessionCard = element("section", "arena-session-card");
  sessionCard.tabIndex = 0;
  sessionCard.setAttribute("aria-label", "Room controls");
  const sessionHeader = element("div", "arena-session-card__header");
  sessionHeader.append(
    element("span", "arena-kicker", "PLAYER ACCESS"),
    element("strong", undefined, "ENTER THE CIRCUIT")
  );
  const sessionInput = input("text", "knockout-arena", "Session code");
  sessionInput.maxLength = 32;
  const nameInput = input("text", randomName(), "Display name");
  nameInput.maxLength = 18;
  const fieldGrid = element("div", "arena-fields");
  fieldGrid.append(field("ROOM CODE", sessionInput), field("CALLSIGN", nameInput));
  const createButton = button("CREATE ROOM", "is-primary");
  const joinButton = button("JOIN RACE");
  const disconnectButton = button("LEAVE CIRCUIT", "is-quiet");
  disconnectButton.disabled = true;
  const actions = element("div", "arena-actions");
  actions.append(createButton, joinButton, disconnectButton);
  const connection = element("p", "arena-connection is-offline", "AUTHORITY READY");
  const localPlayer = element("p", "arena-local-player", "LOCAL SLOT · UNBOUND");
  sessionCard.append(sessionHeader, fieldGrid, actions, connection, localPlayer);

  const telemetry = document.createElement("details");
  telemetry.className = "arena-telemetry";
  const telemetrySummary = document.createElement("summary");
  telemetrySummary.append(
    element("span", "arena-telemetry__pulse"),
    element("span", undefined, "NETCODE // LIVE TELEMETRY"),
    element("span", "arena-telemetry__toggle", "OPEN")
  );
  const metrics = element("div", "arena-metrics");
  const authorityTick = metric(metrics, "AUTH TICK", "0");
  const replayTicks = metric(metrics, "RESIM", "0");
  const pendingInputs = metric(metrics, "INPUT LEAD", "0");
  const effectState = metric(metrics, "FX SETTLED", "0 / 0");
  const payloadSize = metric(metrics, "FRAME", "0 KB");
  const diagnostics = element("pre", "arena-diagnostics", "Awaiting authority frame…");
  telemetry.append(telemetrySummary, metrics, diagnostics);

  const feed = element("aside", "arena-feed");
  const feedHeader = element("div", "arena-feed__header");
  feedHeader.append(
    element("span", "arena-feed__live"),
    element("span", undefined, "RACE CONTROL")
  );
  const log = element("ol", "arena-log") as HTMLOListElement;
  feed.append(feedHeader, log);

  viewport.append(
    atmosphere,
    scanline,
    effectFlash,
    broadcast,
    raceHud,
    hint,
    sessionCard,
    telemetry,
    feed
  );
  shell.append(viewport);
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
    round,
    position,
    progress,
    progressFill,
    roster,
    authorityTick,
    replayTicks,
    pendingInputs,
    effectState,
    payloadSize,
    effectFlash,
    setConnection(status, detail) {
      root.dataset.connection = status;
      connection.className = `arena-connection is-${status}`;
      connection.textContent = detail;
      const signalText = signal.lastElementChild;
      if (signalText) signalText.textContent = detail;
      signal.className = `arena-signal is-${status}`;
    },
    setBusy(busy) {
      root.dataset.busy = String(busy);
      createButton.disabled = busy;
      joinButton.disabled = busy;
      disconnectButton.disabled = busy || root.dataset.connection !== "online";
      sessionInput.disabled = busy;
      nameInput.disabled = busy;
    },
    pushLog(message) {
      const item = element("li", classifyLogMessage(message), message);
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      item.dataset.time = time;
      log.prepend(item);
      while (log.childElementCount > 6) log.lastElementChild?.remove();
    },
    showEffect(event) {
      if (event.phase === "cancel") return;
      effectFlash.className = "arena-effect-flash";
      void effectFlash.offsetWidth;
      effectFlash.classList.add("is-active", `is-${event.kind}`, `is-${event.phase}`);
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
  const replication = recordValue(telemetry.replication);
  const island = recordValue(telemetry.island);
  const effects = recordValue(telemetry.effects);
  const journal = recordValue(effects.journal);
  const presentation = recordValue(effects.presentation);
  const authority = recordValue(telemetry.authority);

  ui.authorityTick.textContent = compactNumber(
    numberValue(telemetry.authorityTick, snapshot?.frame.tick ?? 0)
  );
  ui.replayTicks.textContent = compactNumber(numberValue(island.resimulatedTicks, 0));
  ui.pendingInputs.textContent = compactNumber(numberValue(replication.pendingInputs, 0));
  ui.effectState.textContent = `${compactNumber(numberValue(presentation.confirmed, 0))} / ${compactNumber(numberValue(journal.pending, 0))}`;
  ui.payloadSize.textContent = `${(numberValue(authority.payloadBytes, 0) / 1024).toFixed(1)} KB`;
  ui.diagnostics.textContent = JSON.stringify(telemetry, null, 2);

  if (!snapshot) {
    ui.root.dataset.phase = "offline";
    ui.phase.textContent = "STANDBY";
    ui.timer.textContent = "--:--";
    ui.round.textContent = "ROUND --";
    ui.position.textContent = "-- / --";
    ui.roster.textContent = "WAITING FOR GRID";
    ui.progress.textContent = "0%";
    ui.progressFill.style.setProperty("--race-progress", "0%");
    return;
  }

  ui.root.dataset.phase = snapshot.phase;
  ui.phase.textContent = phaseLabel(snapshot.phase);
  ui.round.textContent = `STAGE ${String(snapshot.match.stageIndex + 1).padStart(2, "0")} / ${String(snapshot.match.stageCount).padStart(2, "0")}`;
  const timeMs =
    snapshot.phase === "countdown"
      ? snapshot.countdownMs
      : Math.max(0, 120_000 - snapshot.roundTimeMs);
  ui.timer.textContent = formatTime(timeMs);
  ui.localPlayer.textContent = `LOCAL SLOT · ${localMemberId ?? "SPECTATOR"}`;

  const racers = snapshot.frame.members
    .filter((member) => member.id.startsWith("player.") || member.id.startsWith("bot."))
    .sort(
      (left, right) =>
        (left.body.position.z ?? Number.POSITIVE_INFINITY) -
        (right.body.position.z ?? Number.POSITIVE_INFINITY)
    );
  const localIndex = racers.findIndex((member) => member.id === localMemberId);
  ui.position.textContent =
    localIndex < 0
      ? `-- / ${String(racers.length).padStart(2, "0")}`
      : `${String(localIndex + 1).padStart(2, "0")} / ${String(racers.length).padStart(2, "0")}`;
  const stageEntrants = snapshot.participants.filter(
    (participant) =>
      participant.actorMemberId !== undefined &&
      participant.stageInstanceId === snapshot.match.stageInstanceId
  );
  const qualified = snapshot.stageResults.at(-1)?.qualifiedParticipantIds.length ?? 0;
  ui.roster.textContent = `${racers.length} LIVE · ${snapshot.eliminatedMemberIds.length} OUT${snapshot.phase === "results" ? ` · ${qualified} QUALIFIED` : ""}`;

  const localMember = snapshot.frame.members.find((member) => member.id === localMemberId);
  const raceProgress = Math.round(
    Math.max(0, Math.min(1, (5.4 - (localMember?.body.position.z ?? 5.4)) / 16.9)) * 100
  );
  ui.progress.textContent = `${raceProgress}%`;
  ui.progressFill.style.setProperty("--race-progress", `${raceProgress}%`);

  ui.hint.replaceChildren();
  if (snapshot.phase === "countdown") {
    ui.hint.append(
      element("strong", undefined, `ROUND ${snapshot.round}`),
      element(
        "span",
        undefined,
        `${snapshot.match.stageKind.toUpperCase()} · ${stageEntrants.length} ENTRANTS`
      )
    );
  } else if (snapshot.phase === "results") {
    const result = snapshot.stageResults.at(-1);
    ui.hint.append(
      element(
        "strong",
        undefined,
        snapshot.winnerId ?? `${result?.qualifiedParticipantIds.length ?? 0} QUALIFIED`
      ),
      element(
        "span",
        undefined,
        snapshot.winnerId === undefined ? "ADVANCE TO THE NEXT STAGE" : "TAKES THE CROWN"
      )
    );
  } else {
    ui.hint.append(
      keycap("WASD"),
      element("span", undefined, "RUN"),
      keycap("SPACE"),
      element("span", undefined, "JUMP"),
      keycap("E"),
      element("span", undefined, "GRAB"),
      keycap("F"),
      element("span", undefined, "USE"),
      keycap("Q"),
      element("span", undefined, "DROP")
    );
  }
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

function keycap(label: string): HTMLElement {
  return element("kbd", "arena-keycap", label);
}

function metric(parent: HTMLElement, label: string, initial: string): HTMLElement {
  const value = element("strong", "arena-metric__value", initial);
  const item = element("div", "arena-metric");
  item.append(element("span", "arena-metric__label", label), value);
  parent.append(item);
  return value;
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

function phaseLabel(phase: ArenaSnapshot["phase"]): string {
  if (phase === "lobby") return "GRID OPEN";
  if (phase === "countdown") return "GET READY";
  if (phase === "running") return "RACE LIVE";
  return "RESULTS";
}

function formatTime(value: number): string {
  if (value <= 3_000) return `${(value / 1000).toFixed(1)}S`;
  const total = Math.ceil(value / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function compactNumber(value: number): string {
  return value >= 10_000
    ? `${(value / 1000).toFixed(1)}K`
    : Math.round(value).toLocaleString("en-US");
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function classifyLogMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("confirm")) return "is-confirm";
  if (normalized.includes("cancel") || normalized.includes("reject")) return "is-alert";
  if (normalized.includes("jump") || normalized.includes("contact")) return "is-effect";
  return "is-system";
}

function randomName(): string {
  const names = ["TURBO BEAN", "NIGHT COMET", "RAMP RAT", "PUSH UNIT", "SOFT IMPACT"];
  return names[Math.floor(Math.random() * names.length)] ?? "TURBO BEAN";
}
