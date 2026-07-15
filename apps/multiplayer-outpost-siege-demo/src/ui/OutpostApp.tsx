import type { DevToolsRuntime } from "@gamekit/devtools";
import { DevToolsOverlay } from "@gamekit/devtools-ui";
import type { UiRuntime } from "@gamekit/ui-core";
import { useCallback } from "react";
import { OutpostLobby, type OutpostConnectionView } from "./OutpostLobby";

export type OutpostBootPhase = "initializing" | "booting" | "running" | "failed";

export type OutpostAppProps = {
  rendererRoot: HTMLElement;
  bootPhase: OutpostBootPhase;
  bootMessage: string;
  devtools?: DevToolsRuntime | undefined;
  uiRuntime: UiRuntime;
  connection: OutpostConnectionView;
  onGameFocus(): void;
  onCreateSession(displayName: string): void;
  onJoinSession(sessionId: string, displayName: string): void;
  onReady(ready: boolean): void;
  onResetConnection(): void;
};

const abilities = [
  { key: "LMB", label: "Rifle", glyph: "◆" },
  { key: "SPACE", label: "Dash", glyph: "»" },
  { key: "Q", label: "Shock Field", glyph: "◎" },
  { key: "E", label: "Turret", glyph: "⌂" }
] as const;

export function OutpostApp({
  bootMessage,
  bootPhase,
  connection,
  devtools,
  onCreateSession,
  onGameFocus,
  onJoinSession,
  onReady,
  onResetConnection,
  rendererRoot,
  uiRuntime
}: OutpostAppProps) {
  const attachRenderer = useCallback(
    (stage: HTMLElement | null) => {
      if (stage && !stage.contains(rendererRoot)) {
        stage.prepend(rendererRoot);
      }
    },
    [rendererRoot]
  );
  const match = connection.match;
  const isRunning = connection.phase === "connected" && match?.phase === "running";
  const participants =
    match?.participants.filter((participant) => participant.status === "active") ?? [];

  return (
    <main className="outpost-app">
      <section
        aria-label="Outpost Siege game viewport"
        className={`outpost-stage ${isRunning ? "is-running" : "is-deployment"}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={onGameFocus}
        ref={attachRenderer}
        tabIndex={0}
      >
        <div className="outpost-cinematic-frame" aria-hidden="true" />

        <header className="outpost-brand">
          <span>FRONTIER 07</span>
          <strong>
            OUTPOST
            <br />
            SIEGE
          </strong>
        </header>

        <section className="outpost-objective" aria-label="Current objective">
          <div>
            <span>{isRunning ? "WAVE 01" : "DEPLOYMENT"}</span>
            <i />
          </div>
          <strong>{isRunning ? "SECURE THE PERIMETER" : "ASSEMBLE YOUR FIRETEAM"}</strong>
          <small>
            {isRunning
              ? "Hold the outpost and prepare the defenses"
              : "Create a squad channel or deploy with an existing team"}
          </small>
        </section>

        <section className="outpost-squad" aria-label="Squad status">
          <span>SQUAD</span>
          {(participants.length > 0
            ? participants
            : [{ playerId: "pending", displayName: "RANGER", ready: false }]
          ).map((participant, index) => (
            <div className="outpost-squad__member" key={participant.playerId}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <div>
                <strong>{participant.displayName ?? "RANGER"}</strong>
                <span>{participant.ready || isRunning ? "READY" : "STANDBY"}</span>
              </div>
              <b />
            </div>
          ))}
        </section>

        <section className="outpost-vitals" aria-label="Player status">
          <div className="outpost-vitals__portrait">R1</div>
          <div className="outpost-vitals__body">
            <div>
              <strong>RANGER 01</strong>
              <span>LV. 01</span>
            </div>
            <Meter label="HP" value={100} tone="health" />
            <Meter label="SH" value={50} tone="shield" />
          </div>
        </section>

        <section className="outpost-abilities" aria-label="Ability bar">
          {abilities.map((ability) => (
            <article className="outpost-ability" key={ability.label}>
              <kbd>{ability.key}</kbd>
              <i>{ability.glyph}</i>
              <div>
                <strong>{ability.label}</strong>
                <span>READY</span>
              </div>
            </article>
          ))}
        </section>

        <div className="outpost-control-hint">
          <kbd>WASD</kbd>
          <span>MOVE</span>
          <i /> <span>WHEEL</span>
          <span>ZOOM</span>
        </div>

        {bootPhase !== "running" ? (
          <section className={`outpost-boot outpost-boot--${bootPhase}`} role="status">
            <div className="outpost-boot__mark">
              <i />
              <i />
              <i />
            </div>
            <span>{bootPhase === "failed" ? "DEPLOYMENT FAILED" : "DEPLOYING TO OUTPOST"}</span>
            <strong>{bootMessage}</strong>
          </section>
        ) : null}

        <OutpostLobby
          connection={connection}
          onCreate={onCreateSession}
          onJoin={onJoinSession}
          onReady={onReady}
          onReset={onResetConnection}
        />
      </section>

      {devtools ? <DevToolsOverlay runtime={devtools} uiRuntime={uiRuntime} /> : null}
    </main>
  );
}

function Meter({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className={`outpost-meter outpost-meter--${tone}`}>
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}
