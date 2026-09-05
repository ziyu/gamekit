import { createMultiplayerSpeculativeEffectJournal } from "../src";
import { describe, expect, it } from "vitest";

describe("multiplayer speculative effect journal", () => {
  it("runs anticipation and authority settlement exactly once across replay duplicates", () => {
    const calls: string[] = [];
    const journal = createMultiplayerSpeculativeEffectJournal<{ label: string }, { label: string }>(
      {
        generation: 1,
        hooks: {
          onAnticipate: (effect) => calls.push(`anticipate:${effect.value.label}`),
          onConfirm: ({ effect }) => calls.push(`confirm:${effect.value.label}`),
          onReplace: ({ effect, authority }) =>
            calls.push(`replace:${effect.value.label}:${authority.label}`)
        }
      }
    );

    expect(
      journal.anticipate({ effectId: "shot-1.audio", tick: 10, value: { label: "a" } })
    ).toMatchObject({ status: "anticipated" });
    expect(
      journal.anticipate({ effectId: "shot-1.audio", tick: 10, value: { label: "a" } })
    ).toMatchObject({ status: "duplicate" });
    expect(
      journal.resolve({
        effectId: "shot-1.audio",
        generation: 1,
        tick: 12,
        outcome: "confirm"
      })
    ).toMatchObject({ status: "confirmed" });
    expect(
      journal.resolve({
        effectId: "shot-1.audio",
        generation: 1,
        tick: 13,
        outcome: "confirm"
      })
    ).toMatchObject({ status: "duplicate" });
    expect(
      journal.anticipate({ effectId: "shot-1.audio", tick: 14, value: { label: "a" } })
    ).toMatchObject({ status: "resolved" });

    expect(
      journal.anticipate({ effectId: "shot-2.tracer", tick: 20, value: { label: "b" } })
    ).toMatchObject({ status: "anticipated" });
    expect(
      journal.resolve({
        effectId: "shot-2.tracer",
        generation: 1,
        tick: 21,
        outcome: "replace",
        authority: { label: "authority" }
      })
    ).toMatchObject({ status: "replaced" });

    expect(calls).toEqual(["anticipate:a", "confirm:a", "anticipate:b", "replace:b:authority"]);
    expect(journal.diagnostics()).toMatchObject({
      anticipated: 2,
      confirmed: 1,
      replaced: 1,
      duplicates: 3,
      pending: 0,
      resolved: 2
    });
  });

  it("bounds pending/resolved state and cancels capacity, expiry, reset, and dispose", () => {
    const cancellations: string[] = [];
    const journal = createMultiplayerSpeculativeEffectJournal<string>({
      generation: "round-1",
      maxPending: 2,
      maxResolved: 1,
      maxAgeTicks: 2,
      hooks: {
        onCancel: ({ effect, reason }) => cancellations.push(`${effect.effectId}:${reason}`)
      }
    });

    journal.anticipate({ effectId: "a", tick: 1, value: "a" });
    journal.anticipate({ effectId: "b", tick: 2, value: "b" });
    expect(journal.anticipate({ effectId: "c", tick: 3, value: "c" })).toMatchObject({
      status: "anticipated",
      evicted: { effectId: "a" }
    });
    expect(journal.expire(5)).toMatchObject([{ effectId: "b" }]);
    journal.reset("round-2");
    journal.anticipate({ effectId: "d", tick: 6, value: "d" });
    journal.dispose();

    expect(cancellations).toEqual([
      "a:capacity",
      "b:expired",
      "c:generation-changed",
      "d:disposed"
    ]);
    expect(journal.diagnostics()).toMatchObject({
      cancelled: 4,
      expired: 1,
      evicted: 1,
      resets: 1,
      pending: 0,
      resolved: 0,
      disposed: true
    });
  });

  it("remembers unmatched authority outcomes and isolates hook failures", () => {
    const hookErrors: string[] = [];
    const journal = createMultiplayerSpeculativeEffectJournal<string>({
      generation: 1,
      maxResolved: 1,
      hooks: {
        onAnticipate() {
          throw new Error("renderer unavailable");
        },
        onHookError: ({ phase, effectId }) => hookErrors.push(`${phase}:${effectId}`)
      }
    });

    expect(
      journal.resolve({ effectId: "early", generation: 1, tick: 1, outcome: "confirm" })
    ).toMatchObject({ status: "unmatched" });
    expect(journal.anticipate({ effectId: "early", tick: 2, value: "late" })).toMatchObject({
      status: "resolved"
    });
    expect(journal.anticipate({ effectId: "next", tick: 3, value: "next" })).toMatchObject({
      status: "anticipated"
    });
    expect(
      journal.resolve({ effectId: "next", generation: 0, tick: 4, outcome: "cancel" })
    ).toMatchObject({ status: "stale-generation" });

    expect(hookErrors).toEqual(["anticipate:next"]);
    expect(journal.diagnostics()).toMatchObject({
      unmatched: 1,
      duplicates: 1,
      staleGenerations: 1,
      hookErrors: 1,
      pending: 1,
      resolved: 1
    });
  });
});
