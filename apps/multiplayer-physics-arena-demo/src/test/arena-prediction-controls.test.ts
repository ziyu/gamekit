import { describe, expect, it } from "vitest";

import { selectArenaPredictionActorControls } from "../client/arena-prediction-controls";

describe("Knockout Arena prediction control selection", () => {
  it("never emits character controls for members absent from the authority frame", () => {
    expect(
      selectArenaPredictionActorControls({
        authorityControls: {
          "player.live": { sequence: 4, moveX: 0, moveZ: -1, jump: false },
          "bot.despawned": { sequence: 4, moveX: 1, moveZ: 0, jump: false }
        },
        liveMemberIds: new Set(["player.live"]),
        eliminatedMemberIds: ["bot.despawned"],
        playerIdsByPeerId: { "peer.local": "player.live" },
        peerId: "peer.local",
        localInput: { moveX: -1, moveZ: 0.5, jump: true },
        inputSequence: 9
      })
    ).toEqual({
      "player.live": { sequence: 9, moveX: -1, moveZ: 0.5, jump: true }
    });
  });

  it("does not reinsert an eliminated or authority-despawned local member", () => {
    expect(
      selectArenaPredictionActorControls({
        authorityControls: {
          "player.out": { sequence: 12, moveX: 0, moveZ: 0, jump: false }
        },
        liveMemberIds: new Set(),
        eliminatedMemberIds: ["player.out"],
        playerIdsByPeerId: { "peer.local": "player.out" },
        peerId: "peer.local",
        localInput: { moveX: 1, moveZ: 1, jump: true },
        inputSequence: 13
      })
    ).toEqual({});
  });
});
