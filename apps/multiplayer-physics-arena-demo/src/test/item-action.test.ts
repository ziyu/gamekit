import { describe, expect, it } from "vitest";

import { readArenaItemAction } from "../items/item-action";

describe("Arena item action protocol", () => {
  it("accepts bounded correlated commands and rejects mismatched targets", () => {
    expect(
      readArenaItemAction({
        type: "interact",
        commandId: "item.command.1",
        inputSequence: 17,
        aimX: 0.5,
        aimZ: -0.5,
        charge: 0,
        authorityEpoch: "m1.s1.r1.p2",
        targetItemId: "item.instance.1",
        targetItemGeneration: 2
      })
    ).toMatchObject({
      type: "interact",
      commandId: "item.command.1",
      authorityEpoch: "m1.s1.r1.p2"
    });
    expect(
      readArenaItemAction({
        type: "interact",
        commandId: "item.command.2",
        inputSequence: 18,
        aimX: 0,
        aimZ: -1,
        charge: 0,
        targetItemId: "item.instance.1"
      })
    ).toBeUndefined();
    expect(
      readArenaItemAction({
        type: "use",
        commandId: "item.command.3",
        inputSequence: 19,
        aimX: 2,
        aimZ: 0,
        charge: 1
      })
    ).toBeUndefined();
  });
});
