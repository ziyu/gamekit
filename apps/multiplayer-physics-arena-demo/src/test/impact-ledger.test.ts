import { describe, expect, it } from "vitest";

import { createArenaImpactLedger, type ArenaImpactLedgerEntry } from "../match/impact-ledger";

describe("Knockout Arena impact attribution", () => {
  it("awards the latest valid KO and bounded distinct assists exactly once", () => {
    const ledger = createArenaImpactLedger({
      knockoutWindowTicks: 20,
      assistWindowTicks: 40,
      retentionTicks: 50,
      impulseThreshold: 2,
      maxAssists: 2
    });
    expect(ledger.record(impact("old", "source.old", 65, 4))).toBe("applied");
    expect(ledger.record(impact("assist-a", "source.a", 75, 3))).toBe("applied");
    expect(ledger.record(impact("assist-a-latest", "source.a", 82, 3.5))).toBe("applied");
    expect(ledger.record(impact("ko", "source.ko", 91, 5))).toBe("applied");
    expect(ledger.record(impact("small", "source.small", 95, 1))).toBe("applied");
    expect(
      ledger.record({ ...impact("ko-copy", "source.copy", 96, 8), hitTicket: "ticket.ko" })
    ).toBe("duplicate");

    const applied = ledger.attribute({
      eliminationId: "elimination.1",
      targetParticipantId: "target",
      tick: 100
    });
    expect(applied).toMatchObject({
      status: "applied",
      attribution: {
        kind: "participant",
        knockoutParticipantId: "source.ko",
        assistParticipantIds: ["source.a", "source.old"],
        impactIds: ["ko", "assist-a-latest", "old"]
      }
    });
    expect(
      ledger.attribute({
        eliminationId: "elimination.1",
        targetParticipantId: "target",
        tick: 100
      })
    ).toEqual({ status: "duplicate", attribution: applied.attribution });
    expect(ledger.diagnostics()).toMatchObject({
      entries: 5,
      attributions: 1,
      recorded: 5,
      duplicates: 2,
      invalidEntries: 0
    });
    ledger.dispose();
    expect(ledger.diagnostics()).toMatchObject({ entries: 0, attributions: 0, disposed: true });
  });

  it("reports environment when impacts are stale, self-authored, or below threshold", () => {
    const ledger = createArenaImpactLedger({
      knockoutWindowTicks: 10,
      assistWindowTicks: 20,
      retentionTicks: 30,
      impulseThreshold: 2
    });
    ledger.record(impact("stale", "source", 10, 4));
    ledger.record({ ...impact("self", "target", 35, 8), cause: "self" });
    ledger.record(impact("small", "source", 39, 1));

    expect(
      ledger.attribute({
        eliminationId: "elimination.environment",
        targetParticipantId: "target",
        tick: 40
      }).attribution
    ).toMatchObject({
      kind: "environment",
      assistParticipantIds: [],
      impactIds: []
    });
    expect(ledger.entries().map((entry) => entry.id)).toEqual(["self", "small"]);
    expect(ledger.diagnostics().prunedEntries).toBe(1);
    ledger.dispose();
  });
});

function impact(
  id: string,
  sourceParticipantId: string,
  tick: number,
  impulseMagnitude: number
): ArenaImpactLedgerEntry {
  return {
    id,
    hitTicket: `ticket.${id}`,
    sourceParticipantId,
    targetParticipantId: "target",
    impulseMagnitude,
    tick,
    cause: "participant"
  };
}
