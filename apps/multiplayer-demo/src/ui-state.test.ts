import { describe, expect, it } from "vitest";
import {
  resolveMultiplayerDemoJoinRole,
  resolveMultiplayerDemoRoomControls,
  resolveRealtimeArenaControlPermissions,
  type MultiplayerDemoRunMode
} from "./ui";

describe("multiplayer-demo UI state", () => {
  it.each([
    [
      "local-offline",
      { host: true, join: true, leave: false, resetRoom: false },
      { ready: true, startRound: true, rematch: true, resetArena: true }
    ],
    [
      "host",
      { host: false, join: false, leave: true, resetRoom: true },
      { ready: true, startRound: true, rematch: true, resetArena: true }
    ],
    [
      "client",
      { host: false, join: false, leave: true, resetRoom: false },
      { ready: true, startRound: false, rematch: false, resetArena: false }
    ],
    [
      "host-not-joined",
      { host: false, join: true, leave: false, resetRoom: true },
      { ready: false, startRound: false, rematch: false, resetArena: false }
    ],
    [
      "hosted-not-joined",
      { host: false, join: true, leave: false, resetRoom: false },
      { ready: false, startRound: false, rematch: false, resetArena: false }
    ]
  ] satisfies Array<
    [
      MultiplayerDemoRunMode,
      ReturnType<typeof resolveMultiplayerDemoRoomControls>,
      ReturnType<typeof resolveRealtimeArenaControlPermissions>
    ]
  >)("resolves controls for %s mode", (mode, roomControls, arenaControls) => {
    expect(resolveMultiplayerDemoRoomControls(mode)).toEqual(roomControls);
    expect(resolveRealtimeArenaControlPermissions(mode)).toEqual(arenaControls);
  });

  it("disables every room control while an action is busy", () => {
    expect(resolveMultiplayerDemoRoomControls("host", true)).toEqual({
      host: false,
      join: false,
      leave: false,
      resetRoom: false
    });
  });

  it.each([
    ["local-offline", "client"],
    ["host", "client"],
    ["client", "client"],
    ["host-not-joined", "host"],
    ["hosted-not-joined", "client"]
  ] satisfies Array<[MultiplayerDemoRunMode, ReturnType<typeof resolveMultiplayerDemoJoinRole>]>)(
    "resolves join role for %s mode",
    (mode, role) => {
      expect(resolveMultiplayerDemoJoinRole(mode)).toBe(role);
    }
  );
});
