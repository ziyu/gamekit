import type { CombatDeliveryRequestResult, CombatRuntime } from "./types";

export type CombatConformanceHarness = {
  runtime: CombatRuntime;
  sourceActorId: string;
  allowedTargetActorId: string;
  blockedTargetActorId: string;
  effectId: string;
  relationshipPolicy: string;
  readAllowedApplications(): number;
  readBlockedApplications(): number;
  dispose(): void;
};

export type CombatConformanceReport = {
  allowed: CombatDeliveryRequestResult;
  blocked: CombatDeliveryRequestResult;
  duplicate: CombatDeliveryRequestResult;
  checks: string[];
};

export function runCombatRuntimeConformance(
  createHarness: () => CombatConformanceHarness
): CombatConformanceReport {
  const harness = createHarness();
  try {
    const allowed = harness.runtime.deliver(
      directRequest(
        "allowed",
        harness.sourceActorId,
        harness.allowedTargetActorId,
        harness.effectId,
        harness.relationshipPolicy
      )
    );
    const duplicate = harness.runtime.deliver(
      directRequest(
        "allowed",
        harness.sourceActorId,
        harness.allowedTargetActorId,
        harness.effectId,
        harness.relationshipPolicy
      )
    );
    const blocked = harness.runtime.deliver(
      directRequest(
        "blocked",
        harness.sourceActorId,
        harness.blockedTargetActorId,
        harness.effectId,
        harness.relationshipPolicy
      )
    );
    assertConformance(allowed.status === "resolved", "allowed delivery resolves");
    assertConformance(
      allowed.status === "resolved" && allowed.hits[0]?.status === "applied",
      "allowed delivery applies its payload"
    );
    assertConformance(
      duplicate.status === "resolved" && duplicate.duplicate,
      "duplicate request is idempotent"
    );
    assertConformance(
      blocked.status === "rejected" && blocked.reason === "target-disallowed",
      "blocked relationship cannot be targeted"
    );
    assertConformance(harness.readAllowedApplications() === 1, "duplicate applies once");
    assertConformance(harness.readBlockedApplications() === 0, "blocked target receives nothing");
    return {
      allowed,
      blocked,
      duplicate,
      checks: [
        "allowed delivery resolves",
        "allowed delivery applies its payload",
        "duplicate request is idempotent",
        "blocked relationship cannot be targeted",
        "duplicate applies once",
        "blocked target receives nothing"
      ]
    };
  } finally {
    harness.dispose();
  }
}

function directRequest(
  suffix: string,
  sourceActorId: string,
  targetActorId: string,
  effectId: string,
  relationshipPolicy: string
) {
  return {
    id: `combat.conformance.${suffix}`,
    sourceActorId,
    delivery: { type: "direct" as const, targetActorId },
    payloads: [{ effectId, target: "hit-actor" as const }],
    relationshipPolicy
  };
}

function assertConformance(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Combat conformance failed: ${message}`);
  }
}
