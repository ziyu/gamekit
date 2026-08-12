import { ARENA_FIXED_STEP_MS } from "../shared/config";
import type {
  ArenaPublicParticipantState,
  ArenaPublicStagePlacement,
  ArenaSnapshot
} from "../shared/protocol";

export type ArenaInputDevice = "keyboard" | "gamepad";

export type ArenaUiCameraState = {
  mode: "playing" | "spectator" | "broadcast";
  targetMemberId?: string | undefined;
};

export type ArenaFeedEntry = {
  id: string;
  tone: "system" | "impact" | "qualified" | "knockout" | "winner";
  kicker: string;
  title: string;
  detail: string;
};

export type ArenaUiViewModel = {
  phase: ArenaSnapshot["phase"] | "offline";
  stage: {
    number: number;
    count: number;
    name: string;
    format: string;
    objective: string;
  };
  timer: string;
  timerUrgent: boolean;
  position: string;
  roster: string;
  progressLabel: string;
  progress: number;
  item: { name: string; state: string; active: boolean };
  instability: number;
  localStatus: string;
  lobby: {
    visible: boolean;
    title: string;
    detail: string;
    participants: Array<{ id: string; name: string; detail: string; status: string }>;
  };
  overlay: {
    visible: boolean;
    tone: "neutral" | "danger" | "success" | "winner";
    kicker: string;
    title: string;
    detail: string;
  };
  spectator: {
    visible: boolean;
    target: string;
    detail: string;
  };
  results: {
    visible: boolean;
    kicker: string;
    title: string;
    detail: string;
    placements: Array<{ rank: number; name: string; outcome: string }>;
  };
  prompts: Array<{ key: string; action: string }>;
};

export type ArenaUiAnnouncementTracker = {
  update(snapshot: ArenaSnapshot | undefined): ArenaFeedEntry[];
  reset(): void;
};

export function createArenaUiAnnouncementTracker(): ArenaUiAnnouncementTracker {
  let initialized = false;
  let matchId = "";
  let phaseInstanceId = "";
  let statuses = new Map<string, ArenaPublicParticipantState["status"]>();
  let hitIds = new Set<string>();
  let resultIds = new Set<string>();

  return {
    update(snapshot) {
      if (snapshot === undefined) {
        initialized = false;
        matchId = "";
        phaseInstanceId = "";
        statuses.clear();
        hitIds.clear();
        resultIds.clear();
        return [];
      }

      const nextStatuses = new Map(snapshot.participants.map(({ id, status }) => [id, status]));
      const nextHitIds = new Set(snapshot.combat.hits.map(({ id }) => id));
      const nextResultIds = new Set(snapshot.stageResults.map(({ id }) => id));
      if (!initialized || snapshot.match.matchId !== matchId) {
        initialized = true;
        matchId = snapshot.match.matchId;
        phaseInstanceId = snapshot.match.phaseInstanceId;
        statuses = nextStatuses;
        hitIds = nextHitIds;
        resultIds = nextResultIds;
        return snapshot.phase === "countdown"
          ? [stageAnnouncement(snapshot, "GRID LOCKED", "Stage briefing live")]
          : [];
      }

      const entries: ArenaFeedEntry[] = [];
      const newHits = snapshot.combat.hits
        .filter(({ id }) => !hitIds.has(id))
        .sort((left, right) => right.tick - left.tick);
      const newlyEliminated = new Set(
        snapshot.participants
          .filter(
            (participant) =>
              participant.status === "eliminated" && statuses.get(participant.id) !== "eliminated"
          )
          .map(({ id }) => id)
      );

      for (const participantId of newlyEliminated) {
        const hit = newHits.find(
          ({ targetParticipantId }) => targetParticipantId === participantId
        );
        entries.push({
          id: `ko:${snapshot.match.stageInstanceId}:${participantId}:${snapshot.frame.tick}`,
          tone: "knockout",
          kicker: "KNOCKOUT",
          title:
            hit === undefined
              ? `${participantName(participantId)} is out`
              : `${participantName(hit.sourceParticipantId)} knocked out ${participantName(participantId)}`,
          detail: hit === undefined ? "Arena hazard" : itemName(hit.definitionId)
        });
      }

      for (const hit of newHits
        .filter(({ targetParticipantId }) => !newlyEliminated.has(targetParticipantId))
        .slice(0, 2)) {
        entries.push({
          id: hit.id,
          tone: "impact",
          kicker: "BIG HIT",
          title: `${participantName(hit.sourceParticipantId)} hit ${participantName(hit.targetParticipantId)}`,
          detail: `${itemName(hit.definitionId)} · ${Math.round(hit.instability * 100)}% unstable`
        });
      }

      for (const participant of snapshot.participants) {
        if (participant.status !== "qualified" || statuses.get(participant.id) === "qualified")
          continue;
        entries.push({
          id: `qualified:${snapshot.match.stageInstanceId}:${participant.id}`,
          tone: "qualified",
          kicker: "QUALIFIED",
          title: participantName(participant.id),
          detail: "Through to the next stage"
        });
      }

      for (const result of snapshot.stageResults.filter(({ id }) => !resultIds.has(id))) {
        if (result.winnerParticipantId !== undefined) {
          entries.push({
            id: `winner:${result.id}`,
            tone: "winner",
            kicker: "CIRCUIT CHAMPION",
            title: participantName(result.winnerParticipantId),
            detail: "Last runner standing"
          });
        }
      }

      if (snapshot.match.phaseInstanceId !== phaseInstanceId) {
        phaseInstanceId = snapshot.match.phaseInstanceId;
        if (snapshot.phase === "running") {
          entries.push(stageAnnouncement(snapshot, "GATES OPEN", "The stage is live"));
        }
      }

      statuses = nextStatuses;
      hitIds = nextHitIds;
      resultIds = nextResultIds;
      return entries.slice(0, 5);
    },
    reset() {
      initialized = false;
      matchId = "";
      phaseInstanceId = "";
      statuses.clear();
      hitIds.clear();
      resultIds.clear();
    }
  };
}

export function buildArenaUiViewModel(input: {
  snapshot: ArenaSnapshot | undefined;
  localMemberId: string | undefined;
  camera: ArenaUiCameraState;
  inputDevice: ArenaInputDevice;
  localPeerId?: string | undefined;
}): ArenaUiViewModel {
  const { snapshot, localMemberId, camera, inputDevice, localPeerId } = input;
  if (snapshot === undefined) return offlineView(inputDevice);

  const stage = stageCopy(snapshot.match.stageKind, snapshot.match.stageId);
  const localParticipant = snapshot.participants.find(
    ({ actorMemberId, peerId }) =>
      (localMemberId !== undefined && actorMemberId === localMemberId) ||
      (localPeerId !== undefined && peerId === localPeerId)
  );
  const watchedParticipant = snapshot.participants.find(
    ({ actorMemberId }) => actorMemberId === camera.targetMemberId
  );
  const focusParticipant = camera.mode === "playing" ? localParticipant : watchedParticipant;
  const focusCombat = snapshot.combat.actors.find(
    ({ participantId }) => participantId === focusParticipant?.id
  );
  const carriedItem = snapshot.items.find(
    ({ ownerParticipantId, state }) =>
      ownerParticipantId === focusParticipant?.id && (state === "carried" || state === "windup")
  );
  const qualifierProgress = new Map(
    snapshot.qualifierProgress.map((entry) => [entry.participantId, entry])
  );
  const stageParticipants = snapshot.participants.filter(
    (participant) =>
      participant.actorMemberId !== undefined &&
      (snapshot.phase === "countdown"
        ? participant.status === "lobby" || participant.status === "qualified"
        : participant.stageInstanceId === snapshot.match.stageInstanceId &&
          (participant.status === "active" || participant.status === "qualified"))
  );
  const memberZ = new Map(
    snapshot.frame.members.map((member) => [member.id, member.body.position.z ?? 0])
  );
  const racers = stageParticipants.sort((left, right) => {
    if (snapshot.match.stageKind !== "qualifier") {
      return (
        (memberZ.get(left.actorMemberId!) ?? Number.POSITIVE_INFINITY) -
          (memberZ.get(right.actorMemberId!) ?? Number.POSITIVE_INFINITY) ||
        left.slot - right.slot ||
        left.id.localeCompare(right.id)
      );
    }
    const leftProgress = qualifierProgress.get(left.id);
    const rightProgress = qualifierProgress.get(right.id);
    if (leftProgress?.finished !== rightProgress?.finished) {
      return leftProgress?.finished ? -1 : 1;
    }
    return (
      (rightProgress?.checkpointCount ?? 0) - (leftProgress?.checkpointCount ?? 0) ||
      (rightProgress?.normalizedProgress ?? 0) - (leftProgress?.normalizedProgress ?? 0) ||
      left.slot - right.slot ||
      left.id.localeCompare(right.id)
    );
  });
  const focusIndex = racers.findIndex(({ id }) => id === focusParticipant?.id);
  const activeCount = snapshot.participants.filter(({ status }) => status === "active").length;
  const stageEntrantCount = snapshot.participants.filter(
    ({ actorMemberId, stageInstanceId, status }) =>
      actorMemberId !== undefined &&
      (snapshot.phase === "countdown"
        ? status === "lobby" || status === "qualified"
        : stageInstanceId === snapshot.match.stageInstanceId)
  ).length;
  const visibleRacerCount = snapshot.phase === "running" ? activeCount : stageEntrantCount;
  const focusQualifierProgress =
    focusParticipant === undefined ? undefined : qualifierProgress.get(focusParticipant.id);
  const progress = Math.round((focusQualifierProgress?.normalizedProgress ?? 0) * 100);
  const latestResult = snapshot.stageResults.at(-1);
  const resultCountdownMs =
    snapshot.phase === "results" && snapshot.match.deadlineTick !== undefined
      ? Math.max(0, snapshot.match.deadlineTick - snapshot.frame.tick) * ARENA_FIXED_STEP_MS
      : 0;
  const isSpectating = camera.mode === "spectator";

  return {
    phase: snapshot.phase,
    stage: {
      number: snapshot.match.stageIndex + 1,
      count: snapshot.match.stageCount,
      ...stage
    },
    timer: formatTimer(
      snapshot.phase === "countdown"
        ? snapshot.countdownMs
        : snapshot.phase === "results"
          ? resultCountdownMs
          : snapshot.phase === "running" && snapshot.match.deadlineTick !== undefined
            ? Math.max(0, snapshot.match.deadlineTick - snapshot.frame.tick) * ARENA_FIXED_STEP_MS
            : 0
    ),
    timerUrgent:
      snapshot.phase === "countdown" ||
      (snapshot.phase === "running" &&
        snapshot.match.deadlineTick !== undefined &&
        Math.max(0, snapshot.match.deadlineTick - snapshot.frame.tick) * ARENA_FIXED_STEP_MS <=
          15_000),
    position:
      focusIndex < 0
        ? `-- / ${String(racers.length).padStart(2, "0")}`
        : `${String(focusIndex + 1).padStart(2, "0")} / ${String(racers.length).padStart(2, "0")}`,
    roster:
      snapshot.phase === "countdown"
        ? `${visibleRacerCount} ON THE GRID`
        : snapshot.match.stageKind === "qualifier"
          ? `${snapshot.qualifierProgress.filter(({ finished }) => finished).length} / ${snapshot.match.qualificationCount} QUALIFIED`
          : `${visibleRacerCount} LIVE · ${snapshot.removedMemberIds.length} OUT`,
    progressLabel:
      snapshot.match.stageKind === "qualifier"
        ? focusQualifierProgress?.finished
          ? "FINISH LOCKED"
          : `CHECKPOINT ${focusQualifierProgress?.checkpointCount ?? 0} / ${focusQualifierProgress?.checkpointTotal ?? 0}`
        : "FIELD STATUS",
    progress:
      snapshot.match.stageKind === "qualifier"
        ? progress
        : Math.round(
            (activeCount /
              Math.max(
                1,
                snapshot.participants.filter(({ kind }) => kind !== "spectator").length
              )) *
              100
          ),
    item: {
      name: carriedItem === undefined ? "EMPTY HANDS" : itemName(carriedItem.definitionId),
      state:
        carriedItem?.state === "windup"
          ? "CHARGING"
          : carriedItem === undefined
            ? "FIND A PICKUP"
            : "READY",
      active: carriedItem !== undefined
    },
    instability: Math.round((focusCombat?.instability ?? 0) * 100),
    localStatus: statusLabel(localParticipant?.status),
    lobby: lobbyView(snapshot),
    overlay: overlayView(snapshot, latestResult, localParticipant, stage.name),
    spectator: {
      visible: isSpectating && snapshot.phase !== "results",
      target:
        watchedParticipant === undefined ? "AUTO CAMERA" : participantName(watchedParticipant.id),
      detail:
        watchedParticipant === undefined
          ? "Waiting for an active runner"
          : `${statusLabel(watchedParticipant.status)} · SLOT ${String(watchedParticipant.slot + 1).padStart(2, "0")}`
    },
    results: resultsView(snapshot, latestResult, resultCountdownMs),
    prompts: controlPrompts(inputDevice, isSpectating)
  };
}

function offlineView(inputDevice: ArenaInputDevice): ArenaUiViewModel {
  return {
    phase: "offline",
    stage: {
      number: 0,
      count: 3,
      name: "KNOCKOUT CIRCUIT",
      format: "PHYSICS PARTY",
      objective: "Create a room or join a friend"
    },
    timer: "--:--",
    timerUrgent: false,
    position: "-- / --",
    roster: "WAITING FOR GRID",
    progressLabel: "COURSE STATUS",
    progress: 0,
    item: { name: "EMPTY HANDS", state: "FIND A PICKUP", active: false },
    instability: 0,
    localStatus: "UNBOUND",
    lobby: {
      visible: false,
      title: "OPEN THE GRID",
      detail: "Two human seats · six arena bots",
      participants: []
    },
    overlay: { visible: false, tone: "neutral", kicker: "", title: "", detail: "" },
    spectator: { visible: false, target: "AUTO CAMERA", detail: "" },
    results: { visible: false, kicker: "", title: "", detail: "", placements: [] },
    prompts: controlPrompts(inputDevice, false)
  };
}

function lobbyView(snapshot: ArenaSnapshot): ArenaUiViewModel["lobby"] {
  const participants = snapshot.participants
    .filter(({ kind }) => kind !== "spectator")
    .sort((left, right) => left.slot - right.slot)
    .map((participant) => ({
      id: participant.id,
      name: participantName(participant.id),
      detail:
        participant.kind === "bot"
          ? "ARENA BOT"
          : participant.connected
            ? "HUMAN LINK"
            : "RESERVED",
      status: statusLabel(participant.status)
    }));
  const humans = snapshot.participants.filter(
    ({ kind, connected }) => kind === "human-slot" && connected
  ).length;
  return {
    visible: snapshot.phase === "lobby",
    title: humans > 0 ? "GRID ASSEMBLED" : "WAITING FOR RUNNERS",
    detail: `${humans} HUMAN ${humans === 1 ? "LINK" : "LINKS"} · ${participants.filter(({ detail }) => detail === "ARENA BOT").length} BOTS · AUTO START`,
    participants
  };
}

function overlayView(
  snapshot: ArenaSnapshot,
  result: ArenaSnapshot["stageResults"][number] | undefined,
  localParticipant: ArenaPublicParticipantState | undefined,
  stageName: string
): ArenaUiViewModel["overlay"] {
  if (snapshot.phase === "countdown") {
    const count = Math.max(1, Math.ceil(snapshot.countdownMs / 1_000));
    return {
      visible: true,
      tone: "neutral",
      kicker: `STAGE ${snapshot.match.stageIndex + 1} · ${stageName}`,
      title: snapshot.countdownMs <= 900 ? "GO!" : String(count),
      detail: stageCopy(snapshot.match.stageKind, snapshot.match.stageId).objective
    };
  }
  if (snapshot.phase === "running" && snapshot.roundTimeMs < 1_900) {
    return {
      visible: true,
      tone: "neutral",
      kicker: `STAGE ${snapshot.match.stageIndex + 1}`,
      title: stageName,
      detail: stageCopy(snapshot.match.stageKind, snapshot.match.stageId).objective
    };
  }
  if (
    snapshot.phase === "running" &&
    snapshot.match.stageKind === "qualifier" &&
    localParticipant?.status === "qualified"
  ) {
    return {
      visible: true,
      tone: "success",
      kicker: "FINISH CONFIRMED",
      title: "QUALIFIED",
      detail: "Your place is locked · watching the remaining runners"
    };
  }
  if (snapshot.phase === "results" && snapshot.winnerId === undefined) {
    const qualified =
      localParticipant !== undefined &&
      result?.qualifiedParticipantIds.includes(localParticipant.id);
    return {
      visible: false,
      tone: qualified ? "success" : "danger",
      kicker: qualified ? "STAGE CLEAR" : "STAGE COMPLETE",
      title: qualified ? "QUALIFIED" : localParticipant === undefined ? "RESULTS" : "ELIMINATED",
      detail: "Next stage queues automatically"
    };
  }
  return { visible: false, tone: "neutral", kicker: "", title: "", detail: "" };
}

function resultsView(
  snapshot: ArenaSnapshot,
  result: ArenaSnapshot["stageResults"][number] | undefined,
  countdownMs: number
): ArenaUiViewModel["results"] {
  if (snapshot.phase !== "results" || result === undefined) {
    return { visible: false, kicker: "", title: "", detail: "", placements: [] };
  }
  const winner = snapshot.winnerId ?? result.winnerParticipantId;
  return {
    visible: true,
    kicker: winner === undefined ? "STAGE RESULTS" : "CIRCUIT CHAMPION",
    title: winner === undefined ? "THE CUT IS MADE" : participantName(winner),
    detail:
      winner === undefined
        ? `Next stage in ${formatTimer(countdownMs)}`
        : `Rematch automatically queues in ${formatTimer(countdownMs)}`,
    placements: [...result.placements]
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 6)
      .map(placementView)
  };
}

function placementView(placement: ArenaPublicStagePlacement) {
  return {
    rank: placement.rank,
    name: participantName(placement.participantId),
    outcome:
      placement.outcome === "winner"
        ? "WINNER"
        : placement.outcome === "qualified"
          ? "QUALIFIED"
          : "OUT"
  };
}

function stageCopy(kind: ArenaSnapshot["match"]["stageKind"], id: string) {
  if (kind === "qualifier") {
    return {
      name: "CIRCUIT FORGE",
      format: "TOP 6 ADVANCE",
      objective: "Race through the factory and cross the finish"
    };
  }
  if (kind === "brawl") {
    return {
      name: "SCRAP YARD",
      format: "LAST 3 ADVANCE",
      objective: "Use pickups, dodge machinery, stay on the platform"
    };
  }
  return {
    name: id.includes("crown") ? "CROWN COLLAPSE" : "FINAL CIRCUIT",
    format: "ONE WINNER",
    objective: "Survive the collapsing crown and take the circuit"
  };
}

function controlPrompts(device: ArenaInputDevice, spectating: boolean) {
  if (spectating) {
    return device === "gamepad"
      ? [
          { key: "LB / RB", action: "SWITCH RUNNER" },
          { key: "MENU", action: "ROOM" }
        ]
      : [
          { key: "[ / ]", action: "SWITCH RUNNER" },
          { key: "TAB", action: "ROOM" }
        ];
  }
  return device === "gamepad"
    ? [
        { key: "LS", action: "RUN" },
        { key: "A", action: "JUMP" },
        { key: "X", action: "GRAB" },
        { key: "RT", action: "USE" },
        { key: "B", action: "DROP" }
      ]
    : [
        { key: "WASD", action: "RUN" },
        { key: "SPACE", action: "JUMP" },
        { key: "E", action: "GRAB" },
        { key: "F", action: "USE" },
        { key: "Q", action: "DROP" }
      ];
}

function stageAnnouncement(
  snapshot: ArenaSnapshot,
  kicker: string,
  detail: string
): ArenaFeedEntry {
  return {
    id: `stage:${snapshot.match.phaseInstanceId}:${kicker}`,
    tone: "system",
    kicker,
    title: stageCopy(snapshot.match.stageKind, snapshot.match.stageId).name,
    detail
  };
}

function participantName(id: string): string {
  const [kind, rawIndex] = id.split(".");
  const index = Number(rawIndex);
  if (kind === "player") return `PLAYER ${Number.isFinite(index) ? index + 1 : rawIndex}`;
  if (kind === "bot") return `BOT ${Number.isFinite(index) ? index + 1 : rawIndex}`;
  return id.replaceAll(/[._-]+/g, " ").toUpperCase();
}

function itemName(id: string): string {
  if (id.includes("foam-ball")) return "FOAM BALL";
  if (id.includes("shock-bomb")) return "SHOCK BOMB";
  if (id.includes("impact-hammer")) return "IMPACT HAMMER";
  return id
    .replace(/^item\./, "")
    .replaceAll("-", " ")
    .toUpperCase();
}

function statusLabel(status: ArenaPublicParticipantState["status"] | undefined): string {
  if (status === undefined) return "SPECTATOR";
  if (status === "next-match") return "NEXT MATCH";
  return status.toUpperCase();
}

function formatTimer(value: number): string {
  if (value <= 3_000) return `${Math.max(0, value / 1_000).toFixed(1)}S`;
  const total = Math.max(0, Math.ceil(value / 1_000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
