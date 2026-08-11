import { describe, expect, it } from "vitest";

import {
  ARENA_CHARACTER_MOTOR_CONTRIBUTOR_ID,
  ARENA_CHARACTER_MOTOR_DEFINITION,
  createArenaCharacterControlCommands,
  createArenaCharacterIntent
} from "../shared/arena-control";

describe("Knockout Arena shared character controls", () => {
  it("maps human and authority AI controls into the same semantic intent", () => {
    const human = createArenaCharacterIntent({ moveX: 1, moveZ: -1, jump: true }, 17);
    const bot = createArenaCharacterIntent({ moveX: 1, moveZ: -1, jump: true }, 17);

    expect(human).toEqual(bot);
    expect(human).toMatchObject({
      sequence: 17,
      move: { x: 1, y: 0, z: -1 },
      facing: { x: 1, y: 0, z: -1 },
      jumpPressed: true,
      jumpHeld: true,
      divePressed: false
    });
    expect(ARENA_CHARACTER_MOTOR_DEFINITION.maxGroundSpeed).toBe(6.4);
  });

  it("builds stable contributor commands and preserves per-actor sequences", () => {
    const commands = createArenaCharacterControlCommands({
      "player.1": { sequence: 11, moveX: -1, moveZ: 0, jump: false },
      "player.0": { sequence: 23, moveX: 1, moveZ: 0, jump: false }
    });

    expect(commands.map(({ memberId }) => memberId)).toEqual(["player.0", "player.1"]);
    expect(commands.map(({ command }) => command)).toMatchObject([
      { type: "control", memberId: "player.0", intent: { sequence: 23 } },
      { type: "control", memberId: "player.1", intent: { sequence: 11 } }
    ]);
    expect(ARENA_CHARACTER_MOTOR_CONTRIBUTOR_ID).toBe("character.motor");
  });
});
