import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { CharacterControllerLabStationId } from "./course";
import type { CharacterControllerLabSnapshot } from "./runtime";

export type CharacterControllerLabUi = {
  root: HTMLElement;
  viewport: HTMLElement;
  pauseButton: HTMLButtonElement;
  stepButton: HTMLButtonElement;
  staggerButton: HTMLButtonElement;
  impulseButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  stationButtons: ReadonlyMap<CharacterControllerLabStationId, HTMLButtonElement>;
  update(snapshot: CharacterControllerLabSnapshot): void;
  setLoading(loading: boolean, detail?: string): void;
  dispose(): void;
};

const stations = [
  ["acceleration", "01", "Free Run", "Camera-relative acceleration plaza"],
  ["slope-step", "02", "Slope Park", "Walkable ramp and bounded stair"],
  ["coyote-gap", "03", "Gap Deck", "Coyote jump and low ceiling"],
  ["platform", "04", "Motion Yard", "Traverse, lift and rotating sweeper"],
  ["impact", "05", "Physics Pit", "Dynamic props, dive and stagger"]
] as const;

export function renderCharacterControllerLabUi(rootElement: HTMLElement): CharacterControllerLabUi {
  const viewportRef = createRef<HTMLElement>();
  const pauseRef = createRef<HTMLButtonElement>();
  const stepRef = createRef<HTMLButtonElement>();
  const staggerRef = createRef<HTMLButtonElement>();
  const impulseRef = createRef<HTMLButtonElement>();
  const resetRef = createRef<HTMLButtonElement>();
  const root = createRoot(rootElement);

  flushSync(() => {
    root.render(
      <main className="controller-lab">
        <header className="controller-lab__masthead">
          <div>
            <span className="controller-lab__kicker">GK // THIRD-PERSON PROVING PARK</span>
            <h1>Character Controller Lab</h1>
          </div>
          <div className="controller-lab__protocol">
            <span>PUBLIC PATH</span>
            <strong>compile → observe → step → PhysicsScene</strong>
          </div>
        </header>

        <section className="controller-lab__workspace">
          <section
            className="controller-lab__viewport"
            ref={viewportRef}
            tabIndex={0}
            aria-label="Character Controller Lab game viewport"
          >
            <div className="controller-lab__loading" data-ui="loading">
              <span className="controller-lab__loading-mark">CC</span>
              <strong>SPINNING UP RAPIER3D</strong>
              <small data-ui="loading-detail">Preparing controller course</small>
            </div>
            <div className="controller-lab__reticle" aria-hidden="true" />
            <div className="controller-lab__viewport-hud">
              <div>
                <span>LIVE MOTOR</span>
                <strong data-ui="mode">AIRBORNE</strong>
              </div>
              <div>
                <span>SUPPORT</span>
                <strong data-ui="ground">SCANNING</strong>
              </div>
              <div>
                <span>SPEED</span>
                <strong data-ui="speed">0.00 M/S</strong>
              </div>
            </div>
            <div className="controller-lab__controls-hint">
              <kbd>WASD</kbd>
              <span>MOVE</span>
              <kbd>DRAG</kbd>
              <span>LOOK</span>
              <kbd>WHEEL</kbd>
              <span>ZOOM</span>
              <kbd>SPACE</kbd>
              <span>JUMP</span>
              <kbd>SHIFT</kbd>
              <span>DIVE</span>
            </div>
          </section>

          <aside className="controller-lab__console">
            <section className="controller-lab__readout controller-lab__readout--primary">
              <span className="controller-lab__section-label">MOTOR STATE</span>
              <div className="controller-lab__mode-lockup">
                <strong data-ui="mode-large">AIRBORNE</strong>
                <span data-ui="ground-badge">NO SUPPORT</span>
              </div>
              <div className="controller-lab__metrics">
                <Metric label="tick" name="tick" />
                <Metric label="queries" name="queries" />
                <Metric label="slope" name="slope" />
                <Metric label="facing" name="facing" />
              </div>
            </section>

            <section className="controller-lab__readout">
              <span className="controller-lab__section-label">FIXED-TICK WINDOWS</span>
              <Timer label="COYOTE" name="coyote" />
              <Timer label="JUMP BUFFER" name="buffer" />
              <Timer label="DIVE" name="dive" />
              <Timer label="RECOVERY" name="recovery" />
              <Timer label="STAGGER" name="stagger" />
            </section>

            <section className="controller-lab__readout">
              <span className="controller-lab__section-label">FAULT INJECTION</span>
              <div className="controller-lab__button-grid">
                <button ref={staggerRef} type="button">
                  STAGGER
                </button>
                <button ref={impulseRef} type="button">
                  IMPACT
                </button>
                <button ref={pauseRef} type="button">
                  PAUSE
                </button>
                <button ref={stepRef} type="button">
                  STEP
                </button>
                <button ref={resetRef} className="controller-lab__reset" type="button">
                  RESET COURSE
                </button>
              </div>
            </section>

            <details className="controller-lab__diagnostics">
              <summary>RAW DIAGNOSTICS</summary>
              <pre data-ui="diagnostics">{}</pre>
            </details>
          </aside>
        </section>

        <footer className="controller-lab__footer">
          <section className="controller-lab__stations">
            {stations.map(([id, index, title, detail]) => (
              <button
                key={id}
                type="button"
                data-station-id={id}
                aria-label={`Calibrate runner at ${title}`}
              >
                <span>{index}</span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </section>
          <section className="controller-lab__trace">
            <span className="controller-lab__section-label">SEMANTIC TRACE</span>
            <ol data-ui="trace" />
          </section>
        </footer>
      </main>
    );
  });

  const viewport = requireRef(viewportRef.current, "viewport");
  const pauseButton = requireRef(pauseRef.current, "pause button");
  const stepButton = requireRef(stepRef.current, "step button");
  const staggerButton = requireRef(staggerRef.current, "stagger button");
  const impulseButton = requireRef(impulseRef.current, "impact button");
  const resetButton = requireRef(resetRef.current, "reset button");
  const stationButtons = new Map<CharacterControllerLabStationId, HTMLButtonElement>();
  for (const [id] of stations) {
    const button = rootElement.querySelector<HTMLButtonElement>(`[data-station-id='${id}']`);
    stationButtons.set(id, requireRef(button, `${id} station button`));
  }

  return {
    root: rootElement,
    viewport,
    pauseButton,
    stepButton,
    staggerButton,
    impulseButton,
    resetButton,
    stationButtons,
    update(snapshot) {
      setText(rootElement, "mode", snapshot.motor.mode.toUpperCase());
      setText(rootElement, "mode-large", snapshot.motor.mode.toUpperCase());
      setText(rootElement, "ground", snapshot.motor.groundBodyId?.split(".").at(-1) ?? "NONE");
      setText(rootElement, "ground-badge", snapshot.motor.grounded ? "GROUNDED" : "NO SUPPORT");
      setText(rootElement, "speed", `${horizontalSpeed(snapshot).toFixed(2)} M/S`);
      setText(rootElement, "tick", String(snapshot.tick).padStart(5, "0"));
      setText(rootElement, "queries", String(snapshot.diagnostics?.queryCount ?? 0));
      setText(
        rootElement,
        "slope",
        snapshot.diagnostics?.groundSlopeRadians === undefined
          ? "--"
          : `${((snapshot.diagnostics.groundSlopeRadians * 180) / Math.PI).toFixed(1)}°`
      );
      setText(rootElement, "facing", `${((snapshot.motor.facingYaw * 180) / Math.PI).toFixed(0)}°`);
      updateTimer(rootElement, "coyote", snapshot.motor.coyoteRemainingMs, 120);
      updateTimer(rootElement, "buffer", snapshot.motor.jumpBufferRemainingMs, 140);
      updateTimer(rootElement, "dive", snapshot.motor.diveRemainingMs, 300);
      updateTimer(rootElement, "recovery", snapshot.motor.recoveryRemainingMs, 240);
      updateTimer(rootElement, "stagger", snapshot.motor.staggerRemainingMs, 620);
      pauseButton.textContent = snapshot.paused ? "RESUME" : "PAUSE";
      rootElement.dataset.motorMode = snapshot.motor.mode;
      rootElement.dataset.grounded = String(snapshot.motor.grounded);
      const diagnostic = rootElement.querySelector<HTMLElement>("[data-ui='diagnostics']");
      if (diagnostic) {
        diagnostic.textContent = JSON.stringify(
          {
            body: {
              position: roundVector(snapshot.body.position),
              velocity: roundVector(snapshot.body.linearVelocity)
            },
            motor: snapshot.motor,
            diagnostics: snapshot.diagnostics,
            contacts: snapshot.contacts.length,
            signature: snapshot.stateSignature
          },
          null,
          2
        );
      }
      updateTrace(rootElement, snapshot);
    },
    setLoading(loading, detail) {
      const loadingElement = rootElement.querySelector<HTMLElement>("[data-ui='loading']");
      if (loadingElement) loadingElement.hidden = !loading;
      if (detail !== undefined) setText(rootElement, "loading-detail", detail);
    },
    dispose() {
      root.unmount();
    }
  };
}

function Metric({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong data-ui={name}>--</strong>
    </div>
  );
}

function Timer({ label, name }: { label: string; name: string }) {
  return (
    <div className="controller-lab__timer">
      <span>{label}</span>
      <i>
        <b data-ui={`${name}-bar`} />
      </i>
      <strong data-ui={name}>0 MS</strong>
    </div>
  );
}

function updateTimer(root: HTMLElement, name: string, value: number, max: number): void {
  setText(root, name, `${Math.round(value)} MS`);
  const bar = root.querySelector<HTMLElement>(`[data-ui='${name}-bar']`);
  if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, value / max))})`;
}

function updateTrace(root: HTMLElement, snapshot: CharacterControllerLabSnapshot): void {
  const list = root.querySelector<HTMLOListElement>("[data-ui='trace']");
  if (!list) return;
  const entries = snapshot.trace.slice(-5).reverse();
  list.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement("li");
      const tick = document.createElement("span");
      tick.textContent = `T${entry.tick}`;
      const code = document.createElement("strong");
      code.textContent = entry.code.replaceAll("-", " ");
      item.append(tick, code);
      return item;
    })
  );
}

function horizontalSpeed(snapshot: CharacterControllerLabSnapshot): number {
  return Math.hypot(snapshot.body.linearVelocity.x, snapshot.body.linearVelocity.z ?? 0);
}

function roundVector(vector: { x: number; y: number; z?: number | undefined }) {
  return {
    x: Math.round(vector.x * 1_000) / 1_000,
    y: Math.round(vector.y * 1_000) / 1_000,
    z: Math.round((vector.z ?? 0) * 1_000) / 1_000
  };
}

function setText(root: HTMLElement, name: string, value: string): void {
  const element = root.querySelector<HTMLElement>(`[data-ui='${name}']`);
  if (element) element.textContent = value;
}

function requireRef<TValue>(value: TValue | null, label: string): TValue {
  if (value === null) throw new Error(`Character Controller Lab ${label} did not mount`);
  return value;
}
