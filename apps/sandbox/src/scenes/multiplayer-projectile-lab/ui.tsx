import { createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  getMultiplayerProjectileWeapon,
  MULTIPLAYER_PROJECTILE_WEAPONS,
  type MultiplayerProjectileVisualKind,
  type MultiplayerProjectileWeaponId
} from "./arsenal";
import { MULTIPLAYER_PROJECTILE_OBSTACLES, MULTIPLAYER_PROJECTILE_WORLD } from "./battlefield";
import type {
  MultiplayerProjectileLabLaneSample,
  MultiplayerProjectileLabRuntime,
  MultiplayerProjectileLabSnapshot,
  MultiplayerProjectileLabTargetSnapshot
} from "./runtime";

export type MultiplayerProjectileLabUi = {
  root: Root;
  canvas: HTMLCanvasElement;
  fireButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  latencyInput: HTMLInputElement;
  faultInput: HTMLInputElement;
  autoFireInput: HTMLInputElement;
  status: HTMLElement;
  matchStatus: HTMLElement;
  correction: HTMLElement;
  targetReadout: HTMLElement;
  weaponReadout: HTMLElement;
  queueDepth: HTMLElement;
  damageReadout: HTMLElement;
  defeatedReadout: HTMLElement;
  ownerSweeps: HTMLElement;
  physicsReplay: HTMLElement;
  checkpointBytes: HTMLElement;
  physicsContacts: HTMLElement;
  cooldownFill: HTMLElement;
  firePrompt: HTMLElement;
  weaponButtons: Map<MultiplayerProjectileWeaponId, HTMLButtonElement>;
  targetButtons: Map<string, HTMLButtonElement>;
  targetHealth: Map<string, HTMLElement>;
};

export function renderMultiplayerProjectileLabUi(
  rootElement: HTMLElement
): MultiplayerProjectileLabUi {
  const canvasRef = createRef<HTMLCanvasElement>();
  const reactRoot = createRoot(rootElement);
  flushSync(() => {
    reactRoot.render(
      <section className="multiplayer-projectile-lab">
        <div className="multiplayer-projectile-lab__scanline" aria-hidden="true" />
        <header className="multiplayer-projectile-lab__header">
          <div className="multiplayer-projectile-lab__title-lockup">
            <span className="multiplayer-projectile-lab__eyebrow">
              FORWARD RANGE HECATE-7 · LOCAL LOOPBACK
            </span>
            <h1>Projectile Combat Field</h1>
            <p>
              One combat unit. Four swept projectiles and one solver-owned rigid body compared
              across three in-process peer views.
            </p>
          </div>
          <div className="multiplayer-projectile-lab__session">
            <span>RAPIER 2D / MEMORY BACKEND</span>
            <strong className="multiplayer-projectile-lab__status" data-ui="mp-status">
              BOOTING
            </strong>
          </div>
        </header>

        <main className="multiplayer-projectile-lab__workspace">
          <section className="multiplayer-projectile-lab__stage">
            <div className="multiplayer-projectile-lab__stage-header">
              <div>
                <span>TACTICAL FEED 01</span>
                <strong>OWNER PREDICTED VIEW</strong>
              </div>
              <div className="multiplayer-projectile-lab__truth-legend">
                <span data-tone="owner">Owner</span>
                <span data-tone="authority">Authority ghost</span>
                <span data-tone="remote">Remote ghost</span>
              </div>
            </div>
            <div className="multiplayer-projectile-lab__viewport-frame">
              <canvas
                ref={canvasRef}
                data-ui="mp-canvas"
                tabIndex={0}
                aria-label="Combat range. Click a hostile unit to select it."
              />
              <div className="multiplayer-projectile-lab__corner multiplayer-projectile-lab__corner--tl" />
              <div className="multiplayer-projectile-lab__corner multiplayer-projectile-lab__corner--br" />
            </div>
            <div className="multiplayer-projectile-lab__stage-footer">
              <div>
                <span>ACTIVE TARGET</span>
                <strong data-ui="mp-target-readout">RED GUNNER</strong>
              </div>
              <div>
                <span>CHAMBERED</span>
                <strong data-ui="mp-weapon-readout">VX-9 CARBINE</strong>
              </div>
              <div>
                <span>NETWORK RESULT</span>
                <strong data-ui="mp-match">IDLE</strong>
              </div>
              <div>
                <span>RECONCILIATION</span>
                <strong data-ui="mp-correction">WAITING</strong>
              </div>
            </div>
          </section>

          <aside className="multiplayer-projectile-lab__command-rail">
            <section className="multiplayer-projectile-lab__unit-card">
              <div className="multiplayer-projectile-lab__section-label">
                <span>FIRETEAM UNIT</span>
                <small>LOCAL OWNER</small>
              </div>
              <div className="multiplayer-projectile-lab__unit-identity">
                <div className="multiplayer-projectile-lab__unit-glyph" aria-hidden="true">
                  V7
                </div>
                <div>
                  <strong>VANGUARD-7</strong>
                  <span>Expeditionary rifle unit</span>
                </div>
              </div>
            </section>

            <section className="multiplayer-projectile-lab__loadout">
              <div className="multiplayer-projectile-lab__section-label">
                <span>PROJECTILE LOADOUT</span>
                <small>KEYS 1—5</small>
              </div>
              <div className="multiplayer-projectile-lab__weapon-list">
                {MULTIPLAYER_PROJECTILE_WEAPONS.map((weapon, index) => (
                  <button
                    type="button"
                    className="multiplayer-projectile-lab__weapon"
                    data-weapon-id={weapon.id}
                    key={weapon.id}
                  >
                    <span className="multiplayer-projectile-lab__weapon-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="multiplayer-projectile-lab__weapon-copy">
                      <strong>{weapon.name}</strong>
                      <small>
                        {weapon.projectileName} · {weapon.damage} DMG
                      </small>
                    </span>
                    <i style={{ "--weapon-tone": weapon.color } as React.CSSProperties} />
                  </button>
                ))}
              </div>
            </section>

            <section className="multiplayer-projectile-lab__targets">
              <div className="multiplayer-projectile-lab__section-label">
                <span>HOSTILE CONTACTS</span>
                <small>CLICK FEED OR CONTACT</small>
              </div>
              <div className="multiplayer-projectile-lab__target-list">
                {[
                  ["target.gunner", "RED GUNNER", "MED"],
                  ["target.overwatch", "OVERWATCH", "LGT"],
                  ["target.drone", "SKIMMER-4", "LGT"],
                  ["target.bulwark", "BULWARK", "HVY"]
                ].map(([id, callsign, armor]) => (
                  <button type="button" data-target-id={id} key={id}>
                    <span>
                      <strong>{callsign}</strong>
                      <small>{armor} ARMOR</small>
                    </span>
                    <output data-target-health={id}>100%</output>
                  </button>
                ))}
              </div>
            </section>

            <section className="multiplayer-projectile-lab__fire-control">
              <button type="button" data-ui="mp-fire" disabled>
                <span data-ui="mp-fire-prompt">FIRE WEAPON</span>
                <small>SPACE · OWNER PREDICTS NEXT FRAME</small>
                <i data-ui="mp-cooldown-fill" />
              </button>
              <label className="multiplayer-projectile-lab__auto-fire">
                <input data-ui="mp-auto-fire" type="checkbox" />
                <span>
                  <strong>AUTO ENGAGE</strong>
                  <small>Repeat at the selected weapon cadence</small>
                </span>
              </label>
            </section>

            <details className="multiplayer-projectile-lab__network" open>
              <summary>LOCAL NETWORK SIMULATION</summary>
              <label className="multiplayer-projectile-lab__range">
                <span>
                  Simulated RTT
                  <output data-ui="mp-latency-value">240 MS</output>
                </span>
                <input
                  data-ui="mp-latency"
                  type="range"
                  min="0"
                  max="1000"
                  step="20"
                  defaultValue="240"
                />
              </label>
              <label className="multiplayer-projectile-lab__toggle">
                <input data-ui="mp-fault" type="checkbox" />
                <span>
                  <strong>Authority cover desync</strong>
                  <small>Server sees a stale blast door across the center lane.</small>
                </span>
              </label>
              <button type="button" data-ui="mp-reset" disabled>
                RESET ENCOUNTER / GENERATION
              </button>
            </details>
          </aside>
        </main>

        <footer className="multiplayer-projectile-lab__telemetry">
          <Telemetry label="Damage confirmed" selector="mp-damage" suffix="DMG" />
          <Telemetry label="Targets down" selector="mp-defeated" suffix="/ 4" />
          <Telemetry label="Packet queues" selector="mp-queues" />
          <Telemetry label="Owner sweeps" selector="mp-owner-sweeps" />
          <Telemetry label="Island replay" selector="mp-physics-replay" suffix="TICKS" />
          <Telemetry label="Checkpoint heap" selector="mp-checkpoint-bytes" />
          <Telemetry label="Rigid contacts" selector="mp-physics-contacts" />
          <div className="multiplayer-projectile-lab__invariant">
            <span>SPATIAL INVARIANT</span>
            <strong>NO KNOWN-BLOCKER PENETRATION</strong>
          </div>
        </footer>
      </section>
    );
  });

  return {
    root: reactRoot,
    canvas: requireUi(rootElement, "mp-canvas", HTMLCanvasElement),
    fireButton: requireUi(rootElement, "mp-fire", HTMLButtonElement),
    resetButton: requireUi(rootElement, "mp-reset", HTMLButtonElement),
    latencyInput: requireUi(rootElement, "mp-latency", HTMLInputElement),
    faultInput: requireUi(rootElement, "mp-fault", HTMLInputElement),
    autoFireInput: requireUi(rootElement, "mp-auto-fire", HTMLInputElement),
    status: requireUi(rootElement, "mp-status", HTMLElement),
    matchStatus: requireUi(rootElement, "mp-match", HTMLElement),
    correction: requireUi(rootElement, "mp-correction", HTMLElement),
    targetReadout: requireUi(rootElement, "mp-target-readout", HTMLElement),
    weaponReadout: requireUi(rootElement, "mp-weapon-readout", HTMLElement),
    queueDepth: requireUi(rootElement, "mp-queues", HTMLElement),
    damageReadout: requireUi(rootElement, "mp-damage", HTMLElement),
    defeatedReadout: requireUi(rootElement, "mp-defeated", HTMLElement),
    ownerSweeps: requireUi(rootElement, "mp-owner-sweeps", HTMLElement),
    physicsReplay: requireUi(rootElement, "mp-physics-replay", HTMLElement),
    checkpointBytes: requireUi(rootElement, "mp-checkpoint-bytes", HTMLElement),
    physicsContacts: requireUi(rootElement, "mp-physics-contacts", HTMLElement),
    cooldownFill: requireUi(rootElement, "mp-cooldown-fill", HTMLElement),
    firePrompt: requireUi(rootElement, "mp-fire-prompt", HTMLElement),
    weaponButtons: new Map(
      [...rootElement.querySelectorAll<HTMLButtonElement>("[data-weapon-id]")].map((button) => [
        button.dataset.weaponId as MultiplayerProjectileWeaponId,
        button
      ])
    ),
    targetButtons: new Map(
      [...rootElement.querySelectorAll<HTMLButtonElement>("[data-target-id]")].map((button) => [
        button.dataset.targetId!,
        button
      ])
    ),
    targetHealth: new Map(
      [...rootElement.querySelectorAll<HTMLElement>("[data-target-health]")].map((element) => [
        element.dataset.targetHealth!,
        element
      ])
    )
  };
}

function Telemetry({
  label,
  selector,
  suffix
}: {
  label: string;
  selector: string;
  suffix?: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        <b data-ui={selector}>—</b>
        {suffix === undefined ? null : <small>{suffix}</small>}
      </strong>
    </div>
  );
}

export function bindMultiplayerProjectileLabUi(
  ui: MultiplayerProjectileLabUi,
  runtime: MultiplayerProjectileLabRuntime
): void {
  ui.fireButton.disabled = false;
  ui.resetButton.disabled = false;
  ui.fireButton.addEventListener("click", () => {
    void runtime.fire();
  });
  ui.resetButton.addEventListener("click", () => {
    runtime.reset();
  });
  ui.latencyInput.addEventListener("input", () => {
    runtime.setLatency(Number(ui.latencyInput.value));
  });
  ui.faultInput.addEventListener("change", () => {
    runtime.setFaultInjection(ui.faultInput.checked);
  });
  ui.autoFireInput.addEventListener("change", () => {
    runtime.setAutoFire(ui.autoFireInput.checked);
  });
  for (const [weaponId, button] of ui.weaponButtons) {
    button.addEventListener("click", () => {
      runtime.selectWeapon(weaponId);
    });
  }
  for (const [targetId, button] of ui.targetButtons) {
    button.addEventListener("click", () => {
      runtime.selectTarget(targetId);
    });
  }
  ui.canvas.addEventListener("pointerdown", (event) => {
    ui.canvas.focus();
    const point = canvasPointerToWorld(ui.canvas, event);
    if (point !== undefined) {
      runtime.selectTargetAt(point);
    }
  });
  ui.canvas.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      void runtime.fire();
      return;
    }
    const index = Number(event.key) - 1;
    const weapon = MULTIPLAYER_PROJECTILE_WEAPONS[index];
    if (weapon !== undefined) {
      runtime.selectWeapon(weapon.id);
    }
  });
}

export function updateMultiplayerProjectileLabUi(
  ui: MultiplayerProjectileLabUi,
  snapshot: MultiplayerProjectileLabSnapshot
): void {
  ui.status.textContent = snapshot.ready ? `${snapshot.peers} LOCAL PEERS` : "STOPPED";
  ui.status.dataset.ready = snapshot.ready ? "true" : "false";
  const latencyOutput = ui.latencyInput
    .closest("label")
    ?.querySelector<HTMLOutputElement>("output");
  if (latencyOutput) {
    latencyOutput.textContent = `${snapshot.latencyMs} MS`;
  }
  const selectedTarget = snapshot.targets.find((target) => target.id === snapshot.selectedTargetId);
  const weapon = getMultiplayerProjectileWeapon(snapshot.selectedWeaponId);
  ui.targetReadout.textContent = selectedTarget?.callsign ?? "NO CONTACT";
  ui.weaponReadout.textContent = weapon.name.toUpperCase();
  ui.matchStatus.textContent = (snapshot.matchStatus ?? "idle").toUpperCase();
  ui.matchStatus.dataset.tone = snapshot.matchStatus ?? "idle";
  ui.correction.textContent = describeCorrection(snapshot);
  ui.correction.dataset.tone =
    snapshot.shots.at(-1)?.physicsReconciliation?.status ??
    snapshot.reconciliation?.status ??
    "idle";
  ui.queueDepth.textContent = `${snapshot.pendingCommands} / ${snapshot.pendingRecords}`;
  ui.damageReadout.textContent = String(snapshot.damageDealt);
  ui.defeatedReadout.textContent = String(snapshot.defeatedTargets);
  ui.ownerSweeps.textContent = String(snapshot.diagnostics.ownerSweeps);
  ui.physicsReplay.textContent = String(snapshot.diagnostics.resimulatedTicks);
  ui.checkpointBytes.textContent = formatBytes(snapshot.diagnostics.checkpointBytes);
  ui.physicsContacts.textContent = String(snapshot.diagnostics.physicsContacts);
  ui.cooldownFill.style.transform = `scaleX(${Math.max(0, Math.min(1, snapshot.cooldownProgress))})`;
  ui.fireButton.disabled = !snapshot.canFire;
  ui.fireButton.dataset.ready = snapshot.canFire ? "true" : "false";
  ui.firePrompt.textContent = snapshot.canFire ? "FIRE WEAPON" : "CYCLING…";
  ui.autoFireInput.checked = snapshot.autoFire;
  ui.faultInput.checked = snapshot.faultInjection;
  for (const [weaponId, button] of ui.weaponButtons) {
    button.dataset.selected = weaponId === snapshot.selectedWeaponId ? "true" : "false";
  }
  for (const target of snapshot.targets) {
    const button = ui.targetButtons.get(target.id);
    const health = ui.targetHealth.get(target.id);
    if (button !== undefined) {
      button.dataset.selected = target.selected ? "true" : "false";
      button.dataset.alive = target.alive ? "true" : "false";
      button.disabled = !target.alive;
    }
    if (health !== undefined) {
      health.textContent = target.alive
        ? `${Math.ceil((target.health / target.maxHealth) * 100)}%`
        : "DOWN";
    }
  }
  drawMultiplayerProjectileLab(ui.canvas, snapshot);
}

function describeCorrection(snapshot: MultiplayerProjectileLabSnapshot): string {
  const physics = snapshot.shots.at(-1)?.physicsReconciliation;
  if (physics !== undefined) {
    if (physics.status === "membership-mismatch") {
      return "ISLAND DEFERRED";
    }
    if (physics.status === "history-overflow") {
      return "HISTORY MISS";
    }
    if (physics.status === "stale-generation") {
      return "STALE ISLAND";
    }
    if (physics.status === "confirmed") {
      return `ISLAND CONFIRMED · ${physics.replayedTicks}T`;
    }
    return `ISLAND CORRECTED ${physics.correctionMagnitude.toFixed(2)}U · ${physics.replayedTicks}T`;
  }
  const result = snapshot.reconciliation;
  if (result === undefined) {
    return "WAITING";
  }
  if (result.status === "pending") {
    return "IN FLIGHT";
  }
  if (result.status === "confirmed") {
    return "CONFIRMED";
  }
  const error = Number.isFinite(result.finishPositionError)
    ? result.finishPositionError.toFixed(2)
    : "∞";
  return `CORRECTED ${error}U`;
}

function formatBytes(value: number): string {
  if (value < 1_024) {
    return `${value} B`;
  }
  if (value < 1_024 * 1_024) {
    return `${(value / 1_024).toFixed(1)} KB`;
  }
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}

type CanvasViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
  x(value: number): number;
  y(value: number): number;
};

function drawMultiplayerProjectileLab(
  canvas: HTMLCanvasElement,
  snapshot: MultiplayerProjectileLabSnapshot
): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(760, Math.floor(rect.width || 1080));
  const height = Math.max(520, Math.floor(rect.height || 620));
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const viewport = createCanvasViewport(width, height);
  drawTerrain(context, width, height, viewport);
  drawAimLine(context, viewport, snapshot);
  for (const obstacle of MULTIPLAYER_PROJECTILE_OBSTACLES) {
    drawObstacle(context, viewport, obstacle);
  }
  if (snapshot.faultInjection) {
    drawAuthorityDesyncCover(context, viewport);
  }
  for (const target of snapshot.targets) {
    drawTarget(context, viewport, target, snapshot.tick);
  }
  drawShooter(context, viewport, snapshot);
  drawProjectiles(context, viewport, snapshot);
  drawCanvasHud(context, width, height, snapshot);
}

function createCanvasViewport(width: number, height: number): CanvasViewport {
  const left = 34;
  const top = 34;
  const drawWidth = width - 68;
  const drawHeight = height - 68;
  return {
    left,
    top,
    width: drawWidth,
    height: drawHeight,
    x: (value) => left + (value / MULTIPLAYER_PROJECTILE_WORLD.width) * drawWidth,
    y: (value) => top + (value / MULTIPLAYER_PROJECTILE_WORLD.height) * drawHeight
  };
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: CanvasViewport
): void {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#20231f");
  gradient.addColorStop(0.55, "#151a19");
  gradient.addColorStop(1, "#111514");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(212, 164, 94, 0.055)";
  context.beginPath();
  context.moveTo(viewport.x(0), viewport.y(31));
  context.lineTo(viewport.x(120), viewport.y(25));
  context.lineTo(viewport.x(120), viewport.y(48));
  context.lineTo(viewport.x(0), viewport.y(43));
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(196, 183, 151, 0.065)";
  context.lineWidth = 1;
  for (let x = 0; x <= MULTIPLAYER_PROJECTILE_WORLD.width; x += 6) {
    context.beginPath();
    context.moveTo(viewport.x(x), viewport.top);
    context.lineTo(viewport.x(x), viewport.top + viewport.height);
    context.stroke();
  }
  for (let y = 0; y <= MULTIPLAYER_PROJECTILE_WORLD.height; y += 6) {
    context.beginPath();
    context.moveTo(viewport.left, viewport.y(y));
    context.lineTo(viewport.left + viewport.width, viewport.y(y));
    context.stroke();
  }

  const craters = [
    { x: 35, y: 20, radius: 3.8 },
    { x: 57, y: 63, radius: 5.2 },
    { x: 91, y: 42, radius: 4.4 },
    { x: 27, y: 59, radius: 2.7 }
  ];
  for (const crater of craters) {
    const radius = (crater.radius / MULTIPLAYER_PROJECTILE_WORLD.width) * viewport.width;
    context.fillStyle = "rgba(0, 0, 0, 0.18)";
    context.beginPath();
    context.ellipse(
      viewport.x(crater.x),
      viewport.y(crater.y),
      radius,
      radius * 0.55,
      -0.2,
      0,
      Math.PI * 2
    );
    context.fill();
    context.strokeStyle = "rgba(190, 154, 101, 0.12)";
    context.stroke();
  }

  context.strokeStyle = "rgba(255, 199, 106, 0.18)";
  context.setLineDash([7, 10]);
  context.beginPath();
  context.moveTo(viewport.x(4), viewport.y(36));
  context.lineTo(viewport.x(118), viewport.y(36));
  context.stroke();
  context.setLineDash([]);
}

function drawAimLine(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  snapshot: MultiplayerProjectileLabSnapshot
): void {
  const target = snapshot.targets.find((entry) => entry.id === snapshot.selectedTargetId);
  if (target === undefined || !target.alive) {
    return;
  }
  context.save();
  context.strokeStyle = "rgba(255, 209, 102, 0.26)";
  context.lineWidth = 1;
  context.setLineDash([3, 8]);
  context.beginPath();
  context.moveTo(
    viewport.x(MULTIPLAYER_PROJECTILE_WORLD.muzzle.x),
    viewport.y(MULTIPLAYER_PROJECTILE_WORLD.muzzle.y)
  );
  context.lineTo(viewport.x(target.position.x), viewport.y(target.position.y));
  context.stroke();
  context.restore();
}

function drawObstacle(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  obstacle: (typeof MULTIPLAYER_PROJECTILE_OBSTACLES)[number]
): void {
  const width = (obstacle.width / MULTIPLAYER_PROJECTILE_WORLD.width) * viewport.width;
  const height = (obstacle.height / MULTIPLAYER_PROJECTILE_WORLD.height) * viewport.height;
  const x = viewport.x(obstacle.position.x) - width / 2;
  const y = viewport.y(obstacle.position.y) - height / 2;
  context.fillStyle = "rgba(0, 0, 0, 0.3)";
  context.fillRect(x + 7, y + 9, width, height);
  context.fillStyle =
    obstacle.kind === "container" ? "#39413d" : obstacle.kind === "relay" ? "#343936" : "#4a4539";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#726b57";
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  context.strokeStyle = "rgba(226, 192, 126, 0.2)";
  for (let offset = 8; offset < width; offset += 12) {
    context.beginPath();
    context.moveTo(x + offset, y + 2);
    context.lineTo(x + offset, y + height - 2);
    context.stroke();
  }
  context.fillStyle = "rgba(240, 213, 165, 0.45)";
  context.font = "600 8px 'IBM Plex Mono', monospace";
  context.fillText(obstacle.label.toUpperCase(), x + 5, y - 6);
}

function drawAuthorityDesyncCover(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport
): void {
  const cover = MULTIPLAYER_PROJECTILE_WORLD.authorityDesyncCover;
  const width = (cover.width / MULTIPLAYER_PROJECTILE_WORLD.width) * viewport.width;
  const height = (cover.height / MULTIPLAYER_PROJECTILE_WORLD.height) * viewport.height;
  const x = viewport.x(cover.position.x) - width / 2;
  const y = viewport.y(cover.position.y) - height / 2;
  context.save();
  context.fillStyle = "rgba(255, 91, 73, 0.08)";
  context.strokeStyle = "rgba(255, 105, 85, 0.8)";
  context.setLineDash([4, 4]);
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  context.fillStyle = "#ff7563";
  context.font = "700 9px 'IBM Plex Mono', monospace";
  context.fillText("AUTHORITY-ONLY COVER", x - 31, y - 8);
  context.restore();
}

function drawTarget(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  target: MultiplayerProjectileLabTargetSnapshot,
  tick: number
): void {
  const x = viewport.x(target.position.x);
  const y = viewport.y(target.position.y);
  const radius = Math.max(
    13,
    (target.radius / MULTIPLAYER_PROJECTILE_WORLD.width) * viewport.width
  );
  const hitFlash = target.hitAgeTicks !== undefined && target.hitAgeTicks < 8;
  context.save();
  context.translate(x, y);
  if (!target.alive) {
    context.fillStyle = "rgba(0, 0, 0, 0.38)";
    context.beginPath();
    context.ellipse(3, 8, radius * 1.2, radius * 0.45, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#665b50";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-radius * 0.7, -radius * 0.5);
    context.lineTo(radius * 0.75, radius * 0.55);
    context.moveTo(radius * 0.7, -radius * 0.55);
    context.lineTo(-radius * 0.7, radius * 0.55);
    context.stroke();
    context.restore();
    return;
  }

  context.fillStyle = "rgba(0, 0, 0, 0.45)";
  context.beginPath();
  context.ellipse(4, radius * 0.66, radius * 1.15, radius * 0.43, 0, 0, Math.PI * 2);
  context.fill();

  if (target.id === "target.drone") {
    context.strokeStyle = hitFlash ? "#fff5d6" : "#c95745";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-radius * 1.15, 0);
    context.lineTo(radius * 1.15, 0);
    context.stroke();
    context.fillStyle = hitFlash ? "#fff5d6" : "#713d35";
    context.beginPath();
    context.ellipse(0, 0, radius * 0.65, radius * 0.46, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ff5d49";
    context.beginPath();
    context.arc(0, 0, 3, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillStyle = hitFlash ? "#fff2cf" : target.armor === "heavy" ? "#6b3d35" : "#57342f";
    context.beginPath();
    context.arc(0, -radius * 0.2, radius * 0.66, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#bd5b49";
    context.lineWidth = target.armor === "heavy" ? 5 : 3;
    context.stroke();
    context.strokeStyle = "#c86b52";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-radius * 0.36, radius * 0.38);
    context.lineTo(-radius * 0.7, radius * 0.9);
    context.moveTo(radius * 0.36, radius * 0.38);
    context.lineTo(radius * 0.7, radius * 0.9);
    context.stroke();
    context.strokeStyle = "#8a4d3f";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(-radius * 0.18, -radius * 0.24);
    context.lineTo(-radius * 1.15, -radius * 0.42);
    context.stroke();
  }

  if (target.selected) {
    const pulse = 1 + Math.sin(tick * 0.12) * 0.08;
    context.strokeStyle = "#ffd166";
    context.lineWidth = 1.5;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.arc(0, 0, radius * 1.65 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    drawTargetBrackets(context, radius * 1.35);
  }
  context.restore();

  const barWidth = 76;
  const barY = y - radius - 25;
  context.fillStyle = "rgba(0, 0, 0, 0.65)";
  context.fillRect(x - barWidth / 2, barY, barWidth, 4);
  context.fillStyle = target.health / target.maxHealth > 0.35 ? "#dc6b54" : "#ffb24c";
  context.fillRect(x - barWidth / 2, barY, barWidth * (target.health / target.maxHealth), 4);
  context.fillStyle = target.selected ? "#f6ddb1" : "rgba(230, 213, 184, 0.72)";
  context.font = "700 9px 'IBM Plex Mono', monospace";
  context.textAlign = "center";
  context.fillText(target.callsign, x, barY - 7);
  context.textAlign = "start";
}

function drawTargetBrackets(context: CanvasRenderingContext2D, radius: number): void {
  context.strokeStyle = "#ffd166";
  context.lineWidth = 2;
  const size = 8;
  for (const [x, y, sx, sy] of [
    [-radius, -radius, 1, 1],
    [radius, -radius, -1, 1],
    [-radius, radius, 1, -1],
    [radius, radius, -1, -1]
  ] as const) {
    context.beginPath();
    context.moveTo(x, y + sy * size);
    context.lineTo(x, y);
    context.lineTo(x + sx * size, y);
    context.stroke();
  }
}

function drawShooter(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  snapshot: MultiplayerProjectileLabSnapshot
): void {
  const position = MULTIPLAYER_PROJECTILE_WORLD.shooter.position;
  const x = viewport.x(position.x);
  const y = viewport.y(position.y);
  const latestShot = snapshot.shots.at(-1);
  const muzzleFlash = latestShot !== undefined && snapshot.tick - latestShot.firedAtTick < 4;
  context.save();
  context.translate(x, y);
  context.fillStyle = "rgba(0, 0, 0, 0.5)";
  context.beginPath();
  context.ellipse(4, 16, 25, 8, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#38584f";
  context.beginPath();
  context.arc(0, 0, 17, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#67c6a8";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#182b27";
  context.beginPath();
  context.arc(0, 0, 8, 0, Math.PI * 2);
  context.fill();
  context.rotate(snapshot.aimAngle);
  context.strokeStyle = "#8bd0b8";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(2, 0);
  context.lineTo(33, 0);
  context.stroke();
  context.strokeStyle = "#263e38";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(12, 0);
  context.lineTo(38, 0);
  context.stroke();
  if (muzzleFlash) {
    context.fillStyle = "#ffe49b";
    context.beginPath();
    context.moveTo(38, 0);
    context.lineTo(51, -8);
    context.lineTo(47, 0);
    context.lineTo(51, 8);
    context.closePath();
    context.fill();
  }
  context.restore();

  context.fillStyle = "#8ef0cc";
  context.font = "700 10px 'IBM Plex Mono', monospace";
  context.textAlign = "center";
  context.fillText("VANGUARD-7 / OWNER", x, y - 30);
  context.textAlign = "start";
}

function drawProjectiles(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  snapshot: MultiplayerProjectileLabSnapshot
): void {
  for (const shot of snapshot.shots) {
    const weapon = getMultiplayerProjectileWeapon(shot.weaponId);
    if (shot.owner !== undefined && projectileSampleIsVisible(shot.owner, snapshot.tick)) {
      drawProjectileSample(
        context,
        viewport,
        shot.owner,
        snapshot.tick,
        weapon.visualKind,
        weapon.color,
        weapon.glow
      );
    }
    if (shot.authority !== undefined) {
      drawNetworkGhost(context, viewport, shot.authority, "#ff9f43", "authority");
    }
    if (shot.remote !== undefined) {
      drawNetworkGhost(context, viewport, shot.remote, "#75a7ff", "remote");
    }
  }
}

function drawProjectileSample(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  sample: MultiplayerProjectileLabLaneSample,
  tick: number,
  kind: MultiplayerProjectileVisualKind,
  color: string,
  glow: string
): void {
  const x = viewport.x(sample.position.x);
  const y = viewport.y(sample.position.y);
  const previousX = viewport.x(sample.previousPosition.x);
  const previousY = viewport.y(sample.previousPosition.y);
  context.save();
  if (kind === "rocket") {
    context.strokeStyle = "rgba(203, 192, 167, 0.32)";
    context.lineWidth = 6;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(previousX, previousY);
    context.lineTo(x, y);
    context.stroke();
  } else if (kind === "physical") {
    const gradient = context.createLinearGradient(previousX, previousY, x, y);
    gradient.addColorStop(0, "rgba(65, 141, 255, 0)");
    gradient.addColorStop(1, "rgba(134, 185, 255, 0.9)");
    context.strokeStyle = gradient;
    context.lineWidth = 4;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(previousX, previousY);
    context.lineTo(x, y);
    context.stroke();
  } else {
    context.strokeStyle = color;
    context.globalAlpha = kind === "pellet" ? 0.55 : 0.82;
    context.lineWidth = kind === "tracer" ? 3 : 2;
    context.beginPath();
    context.moveTo(previousX, previousY);
    context.lineTo(x, y);
    context.stroke();
  }
  context.globalAlpha = 1;
  context.shadowColor = glow;
  context.shadowBlur = kind === "plasma" ? 20 : 10;
  context.fillStyle = color;
  if (kind === "rocket") {
    const angle = Math.atan2(y - previousY, x - previousX);
    context.translate(x, y);
    context.rotate(angle);
    context.fillRect(-8, -3, 16, 6);
    context.fillStyle = "#ffe0a2";
    context.beginPath();
    context.moveTo(-8, 0);
    context.lineTo(-15, -4);
    context.lineTo(-15, 4);
    context.closePath();
    context.fill();
  } else if (kind === "physical") {
    const angle = Math.atan2(y - previousY, x - previousX);
    context.translate(x, y);
    context.rotate(angle + tick * 0.24);
    context.fillStyle = "#d9e8ff";
    context.fillRect(-6, -3, 12, 6);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(-7, -4, 14, 8);
    context.strokeStyle = "rgba(134, 185, 255, 0.54)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(x, y, kind === "plasma" ? 7 : kind === "pellet" ? 2.5 : 3.5, 0, Math.PI * 2);
    context.fill();
    if (kind === "plasma") {
      context.strokeStyle = "rgba(220, 255, 245, 0.9)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, 10, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.restore();

  if (sample.finished && projectileSampleIsVisible(sample, tick)) {
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = 0.62;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, kind === "rocket" ? 27 : kind === "plasma" ? 18 : 11, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function projectileSampleIsVisible(
  sample: MultiplayerProjectileLabLaneSample,
  tick: number
): boolean {
  return sample.active || (sample.finishTick !== undefined && tick - sample.finishTick <= 24);
}

function drawNetworkGhost(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
  sample: MultiplayerProjectileLabLaneSample,
  color: string,
  kind: "authority" | "remote"
): void {
  if (!sample.active) {
    return;
  }
  const x = viewport.x(sample.position.x);
  const y = viewport.y(sample.position.y);
  context.save();
  context.strokeStyle = color;
  context.globalAlpha = kind === "authority" ? 0.72 : 0.5;
  context.lineWidth = 1.5;
  if (kind === "authority") {
    context.setLineDash([3, 3]);
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.strokeRect(-4, -4, 8, 8);
  }
  context.restore();
}

function drawCanvasHud(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: MultiplayerProjectileLabSnapshot
): void {
  context.fillStyle = "rgba(9, 12, 11, 0.72)";
  context.fillRect(16, 15, 178, 26);
  context.fillStyle = "#87e1c1";
  context.font = "700 10px 'IBM Plex Mono', monospace";
  context.fillText(`OWNER // TICK ${snapshot.tick}`, 26, 32);

  context.fillStyle = "rgba(9, 12, 11, 0.72)";
  context.fillRect(width - 202, 15, 186, 26);
  context.fillStyle = snapshot.faultInjection ? "#ff7563" : "#d9c7a6";
  context.fillText(
    snapshot.faultInjection ? "WORLD STATE // DIVERGED" : `NETWORK // ${snapshot.latencyMs} MS RTT`,
    width - 191,
    32
  );

  context.fillStyle = "rgba(9, 12, 11, 0.72)";
  context.fillRect(16, height - 42, 314, 27);
  context.fillStyle = "rgba(226, 210, 180, 0.72)";
  context.fillText("CLICK CONTACT TO TARGET · SPACE TO FIRE · 1—5 LOADOUT", 26, height - 24);
}

function canvasPointerToWorld(
  canvas: HTMLCanvasElement,
  event: PointerEvent
): { x: number; y: number } | undefined {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  const viewport = createCanvasViewport(rect.width, rect.height);
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  return {
    x: ((localX - viewport.left) / viewport.width) * MULTIPLAYER_PROJECTILE_WORLD.width,
    y: ((localY - viewport.top) / viewport.height) * MULTIPLAYER_PROJECTILE_WORLD.height
  };
}

function requireUi<TElement extends Element>(
  root: HTMLElement,
  selector: string,
  constructor: { new (): TElement }
): TElement {
  const element = root.querySelector(`[data-ui="${selector}"]`);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing multiplayer projectile lab UI element: ${selector}`);
  }
  return element;
}
