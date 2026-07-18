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
  { key: "LMB", label: "Rifle", glyph: "◆", abilityId: "ability.outpost.rifle_fire" },
  { key: "SPACE", label: "Dash", glyph: "»", abilityId: "ability.outpost.dash" },
  { key: "Q", label: "Shock Field", glyph: "◎", abilityId: "ability.outpost.shock_field" },
  { key: "E", label: "Turret", glyph: "⌂", abilityId: "ability.outpost.deploy_turret" }
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
  const localActor = match?.combat.actors.find(
    (actor) => actor.kind === "player" && actor.objectId === connection.localPlayerId
  );
  const hostileCount = match?.combat.actors.filter((actor) => actor.kind === "enemy").length ?? 0;
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
              ? `${hostileCount} HOSTILES · ${match?.combat.kills ?? 0} KILLS · ${Math.round(localActor?.resource ?? 0)} SUPPLY`
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
            <Meter label="HP" max={100} value={localActor?.health ?? 100} tone="health" />
            <Meter label="SH" max={50} value={localActor?.shield ?? 50} tone="shield" />
          </div>
        </section>

        <section className="outpost-abilities" aria-label="Ability bar">
          {abilities.map((ability) => (
            <article
              className={`outpost-ability ${abilityStateClass(
                ability.abilityId,
                localActor,
                match?.elapsedMs ?? 0
              )}`}
              key={ability.label}
            >
              <kbd>{ability.key}</kbd>
              <i>{ability.glyph}</i>
              <div>
                <strong>{ability.label}</strong>
                <span>{abilityStatus(ability.abilityId, localActor, match?.elapsedMs ?? 0)}</span>
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

function Meter({
  label,
  max,
  tone,
  value
}: {
  label: string;
  max: number;
  tone: string;
  value: number;
}) {
  const rounded = Math.max(0, Math.round(value));
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`outpost-meter outpost-meter--${tone}`}>
      <span>{label}</span>
      <div>
        <i style={{ width: `${percentage}%` }} />
      </div>
      <strong>{rounded}</strong>
    </div>
  );
}

function abilityStatus(
  abilityId: (typeof abilities)[number]["abilityId"],
  actor: NonNullable<OutpostConnectionView["match"]>["combat"]["actors"][number] | undefined,
  elapsedMs: number
): string {
  if (!actor) {
    return "SYNCING";
  }
  const remainingMs = Math.max(0, (actor.cooldowns[abilityId] ?? 0) - elapsedMs);
  if (remainingMs > 0) {
    return `${(remainingMs / 1000).toFixed(1)}S`;
  }
  if (abilityId === "ability.outpost.dash" && actor.stamina < 25) {
    return "NO STAMINA";
  }
  if (abilityId === "ability.outpost.deploy_turret" && actor.resource < 25) {
    return "NEED 25";
  }
  return "READY";
}

function abilityStateClass(
  abilityId: (typeof abilities)[number]["abilityId"],
  actor: NonNullable<OutpostConnectionView["match"]>["combat"]["actors"][number] | undefined,
  elapsedMs: number
): string {
  const status = abilityStatus(abilityId, actor, elapsedMs);
  return status === "READY" ? "is-ready" : status.endsWith("S") ? "is-cooldown" : "is-blocked";
}
