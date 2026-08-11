import { describe, expect, it } from "vitest";

import { applyArenaGamepadDeadZone, readArenaStandardGamepad } from "../client/arena-input";
import { buildArenaUiViewModel, createArenaUiAnnouncementTracker } from "../client/arena-ui-model";
import type { ArenaSnapshot } from "../shared/protocol";

describe("Knockout Circuit game UX", () => {
  it("renders device-aware stage, combat and spectator state without telemetry", () => {
    const snapshot = arenaSnapshot("countdown");
    const countdown = buildArenaUiViewModel({
      snapshot,
      localMemberId: "player.0",
      camera: { mode: "playing", targetMemberId: "player.0" },
      inputDevice: "gamepad"
    });

    expect(countdown).toMatchObject({
      phase: "countdown",
      stage: { name: "CIRCUIT FORGE", format: "TOP 6 ADVANCE" },
      overlay: { visible: true, title: "3" },
      item: { name: "FOAM BALL", active: true },
      instability: 62
    });
    expect(countdown.prompts.map(({ key }) => key)).toEqual(["LS", "A", "X", "RT", "B"]);

    snapshot.phase = "running";
    snapshot.participants[0]!.status = "eliminated";
    const spectator = buildArenaUiViewModel({
      snapshot,
      localMemberId: "player.0",
      camera: { mode: "spectator", targetMemberId: "bot.0" },
      inputDevice: "keyboard",
      localPeerId: "peer.0"
    });
    expect(spectator.spectator).toMatchObject({ visible: true, target: "BOT 1" });
    expect(spectator.localStatus).toBe("ELIMINATED");
    expect(spectator.prompts[0]).toEqual({ key: "[ / ]", action: "SWITCH RUNNER" });
  });

  it("publishes one bounded knockout announcement and a complete results podium", () => {
    const tracker = createArenaUiAnnouncementTracker();
    const before = arenaSnapshot("running");
    expect(tracker.update(before)).toEqual([]);

    const after = structuredClone(before);
    after.frame.tick = 41;
    after.participants[1]!.status = "eliminated";
    after.eliminatedMemberIds = ["bot.0"];
    after.combat.hits = [
      {
        id: "hit.41",
        sourceParticipantId: "player.0",
        targetParticipantId: "bot.0",
        itemId: "item.0",
        itemGeneration: 1,
        definitionId: "item.foam-ball",
        tick: 41,
        impulseMagnitude: 8,
        instability: 0.9
      }
    ];
    const announcements = tracker.update(after);
    expect(announcements).toEqual([
      expect.objectContaining({
        tone: "knockout",
        title: "PLAYER 1 knocked out BOT 1",
        detail: "FOAM BALL"
      })
    ]);
    expect(tracker.update(after)).toEqual([]);

    const results = arenaSnapshot("results");
    results.winnerId = "player.0";
    results.stageResults = [
      {
        id: "result.1",
        stageInstanceId: results.match.stageInstanceId,
        stageKind: "final",
        reason: "stage-rule",
        qualifiedParticipantIds: ["player.0"],
        eliminatedParticipantIds: ["bot.0"],
        winnerParticipantId: "player.0",
        placements: [
          {
            id: "placement.1",
            rank: 1,
            participantId: "player.0",
            outcome: "winner",
            rankingKey: [1]
          },
          {
            id: "placement.2",
            rank: 2,
            participantId: "bot.0",
            outcome: "eliminated",
            rankingKey: [2]
          }
        ]
      }
    ];
    const view = buildArenaUiViewModel({
      snapshot: results,
      localMemberId: "player.0",
      camera: { mode: "broadcast", targetMemberId: "player.0" },
      inputDevice: "keyboard"
    });
    expect(view.results).toMatchObject({
      visible: true,
      kicker: "CIRCUIT CHAMPION",
      title: "PLAYER 1",
      placements: [
        { rank: 1, outcome: "WINNER" },
        { rank: 2, outcome: "OUT" }
      ]
    });
    expect(view.results.detail).toContain("Rematch automatically queues");
  });

  it("normalizes standard gamepad input and only emits button edges once", () => {
    expect(applyArenaGamepadDeadZone(0.1)).toBe(0);
    expect(applyArenaGamepadDeadZone(-1)).toBe(-1);
    const buttons = Array.from({ length: 8 }, () => ({ pressed: false })) as GamepadButton[];
    buttons[0] = { pressed: true } as GamepadButton;
    buttons[2] = { pressed: true } as GamepadButton;
    buttons[5] = { pressed: true } as GamepadButton;
    buttons[7] = { pressed: true } as GamepadButton;
    const first = readArenaStandardGamepad({ axes: [0.59, -0.18], buttons }, []);
    expect(first).toMatchObject({
      moveZ: 0,
      jump: true,
      interact: true,
      use: true,
      nextTarget: true,
      active: true
    });
    expect(first.moveX).toBeCloseTo(0.5);
    const held = readArenaStandardGamepad(
      { axes: [0, 0], buttons },
      buttons.map(({ pressed }) => pressed)
    );
    expect(held).toMatchObject({
      jump: false,
      interact: false,
      use: false,
      nextTarget: false,
      active: false
    });
  });
});

function arenaSnapshot(phase: ArenaSnapshot["phase"]): ArenaSnapshot {
  return {
    phase,
    round: 1,
    countdownMs: phase === "countdown" ? 2_400 : 0,
    roundTimeMs: phase === "running" ? 8_000 : 0,
    match: {
      matchId: "match.1",
      phaseInstanceId: `match.1.${phase}`,
      stageIndex: 0,
      stageCount: 3,
      stageId: "stage.circuit-forge",
      stageKind: "qualifier",
      stageInstanceId: "match.1:stage.circuit-forge:1",
      startedAtTick: 0,
      stageStartedAtTick: 0,
      deadlineTick: phase === "results" ? 180 : undefined,
      membershipRevision: 1
    },
    participants: [
      {
        id: "player.0",
        kind: "human-slot",
        slot: 0,
        actorMemberId: "player.0",
        peerId: "peer.0",
        connected: true,
        status: "active",
        stageInstanceId: "match.1:stage.circuit-forge:1",
        revision: 1
      },
      {
        id: "bot.0",
        kind: "bot",
        slot: 1,
        actorMemberId: "bot.0",
        connected: false,
        status: "active",
        stageInstanceId: "match.1:stage.circuit-forge:1",
        revision: 1
      }
    ],
    stageResults: [],
    items: [
      {
        id: "item.0",
        definitionId: "item.foam-ball",
        instanceGeneration: 1,
        state: "carried",
        ownerParticipantId: "player.0",
        stateChangedAtTick: 10,
        revision: 1
      }
    ],
    itemActions: [],
    combat: {
      actors: [
        {
          participantId: "player.0",
          instability: 0.62,
          staggerUntilTick: 0,
          revision: 1
        }
      ],
      hits: []
    },
    frame: {
      generation: "match.1.stage.1",
      tick: phase === "results" ? 120 : 40,
      members: [body("player.0", 1), body("bot.0", 2)]
    },
    playerIdsByPeerId: { "peer.0": "player.0" },
    inputAcksByPeerId: { "peer.0": 40 },
    actorControlsByMemberId: {},
    eliminatedMemberIds: [],
    effects: [],
    serverTime: 1_000,
    authority: {
      receivedInputBundles: 0,
      acceptedInputs: 0,
      rejectedInputs: 0,
      queuedInputs: 0,
      payloadBytes: 0,
      activePeers: 1
    }
  } as unknown as ArenaSnapshot;
}

function body(id: string, z: number) {
  return {
    id,
    body: {
      id,
      kind: "dynamic" as const,
      position: { x: 0, y: 1, z },
      linearVelocity: { x: 0, y: 0, z: 0 },
      sleeping: false
    }
  };
}
