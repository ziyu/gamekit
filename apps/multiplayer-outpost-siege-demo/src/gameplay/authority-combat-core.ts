import { createCombatModule, type CombatHitResult } from "@gamekit/combat";
import { PhysicsTransformComponent, type PhysicsVector } from "@gamekit/physics-core";

import { OUTPOST_ARENA } from "../content";
import type { CombatState } from "./authority-combat-state";

export type OutpostCombatCoreIntegration = {
  module: ReturnType<typeof createCombatModule>;
  rememberAim(actorId: string, point: PhysicsVector): void;
  dispose(): void;
};

export function createOutpostCombatCoreIntegration(
  state: CombatState,
  onHit: (
    hit: CombatHitResult,
    context: { correlationId?: string | undefined; parentId?: string | undefined }
  ) => void
): OutpostCombatCoreIntegration {
  const aimByActorId = new Map<string, PhysicsVector>();
  const offHit = state.options.eventBus.on<CombatHitResult>("combat.hit_resolved", (event) => {
    onHit(event.payload, {
      ...(event.correlationId === undefined ? {} : { correlationId: event.correlationId }),
      ...(event.parentId === undefined ? {} : { parentId: event.parentId })
    });
  });
  const module = createCombatModule({
    id: "outpost.authority.combat-core",
    dataRegistry: state.options.dataRegistry,
    gas: state.options.gas,
    physics: state.options.physics,
    handle: state.options.combat,
    traceStore: state.options.combatTrace,
    relationshipResolver: {
      resolve(source, target) {
        if (source.actorId !== undefined && source.actorId === target.actorId) {
          return "self";
        }
        const sourceTeam = teamTag(source.tags);
        const targetTeam = teamTag(target.tags);
        return sourceTeam !== undefined && sourceTeam === targetTeam ? "ally" : "hostile";
      },
      allows(policyId, relationship) {
        return policyId === "combat.outpost.relationship.hostile" && relationship === "hostile";
      }
    },
    projectileBounds: {
      min: { x: 0, y: 0 },
      max: { x: OUTPOST_ARENA.width, y: OUTPOST_ARENA.height }
    },
    limits: {
      maxActiveProjectiles: 256,
      maxCandidatesPerRequest: 96,
      maxTargetsPerRequest: 64,
      maxProjectileLifetimeMs: 4_000,
      recentDeliveryLimit: 192,
      resolvedTicketLimit: 2_048
    },
    abilityDelivery: {
      resolveRequest({ binding, execution }) {
        const origin = actorPosition(state, execution.actorId);
        if (origin === undefined) {
          return false;
        }
        if (binding.id === "combat.outpost.binding.rifle") {
          const aim =
            aimByActorId.get(execution.actorId) ??
            (execution.targetActorId === undefined
              ? undefined
              : actorPosition(state, execution.targetActorId));
          if (aim === undefined) {
            return false;
          }
          return { origin, position: origin, direction: normalizedDelta(origin, aim) };
        }
        return { origin, position: origin };
      },
      onResult({ execution }) {
        aimByActorId.delete(execution.actorId);
      },
      onError({ execution }) {
        aimByActorId.delete(execution.actorId);
      }
    }
  });

  return {
    module,
    rememberAim(actorId, point) {
      aimByActorId.set(actorId, { ...point });
    },
    dispose() {
      offHit();
      aimByActorId.clear();
    }
  };
}

function actorPosition(state: CombatState, actorId: string): PhysicsVector | undefined {
  if (!state.options.gas.hasActor(actorId)) {
    return undefined;
  }
  const entityId = state.options.gas.getActor(actorId).actor.entityId;
  if (entityId === undefined) {
    return undefined;
  }
  return state.options.world.get(entityId, PhysicsTransformComponent)?.position;
}

function normalizedDelta(from: PhysicsVector, to: PhysicsVector): PhysicsVector {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);
  return length <= 0.0001 ? { x: 1, y: 0 } : { x: x / length, y: y / length };
}

function teamTag(tags: string[] | undefined): string | undefined {
  return tags?.find((tag) => tag.startsWith("team."));
}
