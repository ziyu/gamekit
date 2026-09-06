import { useState, type FormEvent } from "react";

import type { OutpostClientAuthoritySnapshot } from "../gameplay";

export type OutpostConnectionView = {
  phase: "lobby" | "connecting" | "connected" | "failed";
  sessionId?: string;
  localPlayerId?: string;
  error?: string;
  match?: OutpostClientAuthoritySnapshot;
  readyPending?: boolean;
};

export type OutpostLobbyProps = {
  connection: OutpostConnectionView;
  onCreate(displayName: string): void;
  onJoin(sessionId: string, displayName: string): void;
  onReady(ready: boolean): void;
  onReset(): void;
};

export function OutpostLobby({
  connection,
  onCreate,
  onJoin,
  onReady,
  onReset
}: OutpostLobbyProps) {
  const [displayName, setDisplayName] = useState("RANGER");
  const [sessionId, setSessionId] = useState(connection.sessionId ?? "");
  const [joinMode, setJoinMode] = useState(connection.sessionId !== undefined);

  if (connection.phase === "connecting") {
    return (
      <section className="outpost-lobby outpost-lobby--connecting" role="status">
        <div className="outpost-lobby__scan" aria-hidden="true" />
        <p>FRONTIER RELAY</p>
        <h1>ESTABLISHING UPLINK</h1>
        <span>Negotiating encrypted squad channel…</span>
      </section>
    );
  }

  if (connection.phase === "failed") {
    return (
      <section className="outpost-lobby outpost-lobby--failed" role="alert">
        <p>UPLINK REJECTED</p>
        <h1>DEPLOYMENT ABORTED</h1>
        <span>{connection.error ?? "The outpost relay did not respond."}</span>
        <button className="outpost-lobby__primary" onClick={onReset} type="button">
          RETURN TO RELAY
        </button>
      </section>
    );
  }

  if (connection.phase === "connected" && connection.sessionId) {
    const match = connection.match;
    const localParticipant = match?.participants.find(
      (participant) => participant.playerId === connection.localPlayerId
    );
    const ready = localParticipant?.ready === true;
    const isRunning = match?.phase === "running";
    if (isRunning) {
      return null;
    }
    return (
      <section className="outpost-lobby outpost-lobby--roster" aria-label="Squad lobby">
        <header>
          <div>
            <p>PRIVATE FIRETEAM</p>
            <h1>{connection.sessionId}</h1>
          </div>
          <span>{match?.phase === "countdown" ? "DEPLOYMENT LOCKED" : "AWAITING RANGERS"}</span>
        </header>

        <div className="outpost-lobby__roster">
          {Array.from({ length: 4 }, (_, slot) => {
            const participant = match?.participants.find((entry) => entry.slot === slot);
            return (
              <article
                className={`outpost-lobby__slot ${participant ? "is-occupied" : ""}`}
                key={slot}
              >
                <b>{String(slot + 1).padStart(2, "0")}</b>
                <div>
                  <strong>{participant?.displayName ?? "OPEN SLOT"}</strong>
                  <span>
                    {participant ? (participant.ready ? "READY" : "STANDING BY") : "INVITE"}
                  </span>
                </div>
                <i aria-hidden="true" />
              </article>
            );
          })}
        </div>

        <footer>
          <div>
            <span>SQUAD CODE</span>
            <strong>{connection.sessionId}</strong>
          </div>
          {match?.phase === "countdown" ? (
            <div className="outpost-lobby__countdown">
              <span>LAUNCH IN</span>
              <strong>{Math.max(1, Math.ceil(match.countdownMsRemaining / 1000))}</strong>
            </div>
          ) : (
            <button
              className={`outpost-lobby__primary ${ready ? "is-ready" : ""}`}
              disabled={!localParticipant || connection.readyPending}
              onClick={() => onReady(!ready)}
              type="button"
            >
              {connection.readyPending ? "TRANSMITTING" : ready ? "STAND DOWN" : "READY FOR DROP"}
            </button>
          )}
        </footer>
      </section>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (joinMode) {
      onJoin(sessionId, displayName);
    } else {
      onCreate(displayName);
    }
  };

  return (
    <section className="outpost-lobby outpost-lobby--gate" aria-label="Multiplayer deployment">
      <div className="outpost-lobby__serial" aria-hidden="true">
        OS//07 <i /> CO-OP AUTHORITY
      </div>
      <div className="outpost-lobby__intro">
        <p>FRONTIER DEFENSE COMMAND</p>
        <h1>
          HOLD THE LINE.
          <br />
          <em>TOGETHER.</em>
        </h1>
        <span>Four rangers. One server-authoritative battlefield.</span>
      </div>

      <form className="outpost-lobby__form" onSubmit={submit}>
        <div className="outpost-lobby__mode" role="tablist" aria-label="Deployment mode">
          <button
            aria-selected={!joinMode}
            className={!joinMode ? "is-active" : ""}
            onClick={() => setJoinMode(false)}
            role="tab"
            type="button"
          >
            FORM FIRETEAM
          </button>
          <button
            aria-selected={joinMode}
            className={joinMode ? "is-active" : ""}
            onClick={() => setJoinMode(true)}
            role="tab"
            type="button"
          >
            JOIN FIRETEAM
          </button>
        </div>

        <label>
          <span>CALL SIGN</span>
          <input
            autoComplete="nickname"
            maxLength={16}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="RANGER"
            value={displayName}
          />
        </label>
        {joinMode ? (
          <label>
            <span>SQUAD CODE</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              maxLength={32}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="os-7f31a9c2"
              required
              spellCheck={false}
              value={sessionId}
            />
          </label>
        ) : null}

        <button className="outpost-lobby__primary" type="submit">
          <span>{joinMode ? "ENTER SQUAD CHANNEL" : "CREATE SQUAD CHANNEL"}</span>
          <b aria-hidden="true">→</b>
        </button>
      </form>
    </section>
  );
}
