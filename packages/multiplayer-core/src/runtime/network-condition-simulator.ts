import type {
  MultiplayerBackendAdapter,
  MultiplayerBackendConnection,
  MultiplayerBackendListener,
  MultiplayerBackendSnapshot,
  MultiplayerMessageEnvelope
} from "./types";

export type MultiplayerNetworkConditionDirection = "outgoing" | "incoming";

export type MultiplayerNetworkConditionProfile = {
  latencyMs?: number | undefined;
  jitterMs?: number | undefined;
  lossPercent?: number | undefined;
  duplicatePercent?: number | undefined;
  seed?: number | undefined;
  maxPendingDeliveries?: number | undefined;
  affects?(
    direction: MultiplayerNetworkConditionDirection,
    message: MultiplayerMessageEnvelope
  ): boolean;
};

export type MultiplayerNetworkConditionSimulatorDiagnostics = {
  nowMs: number;
  pendingDeliveries: number;
  scheduledDeliveries: number;
  deliveredMessages: number;
  droppedMessages: number;
  duplicatedMessages: number;
  capacityDrops: number;
  deliveryErrors: number;
  lastDeliveryError?: string | undefined;
  maxPendingDeliveries: number;
  activeConnections: number;
  disposed: boolean;
};

export type MultiplayerNetworkConditionSimulator = {
  backend: MultiplayerBackendAdapter;
  advance(deltaMs: number): Promise<void>;
  flush(): Promise<void>;
  diagnostics(): MultiplayerNetworkConditionSimulatorDiagnostics;
  dispose(): void;
};

type ScheduledDelivery = {
  id: number;
  ownerId: number;
  dueAt: number;
  deliver(): Promise<void> | void;
};

const DEFAULT_MAX_PENDING_DELIVERIES = 4_096;

/**
 * Wraps any multiplayer backend with deterministic, manually advanced network conditions.
 * Session lifecycle stays immediate; only selected message delivery is delayed or dropped.
 */
export function createMultiplayerNetworkConditionSimulator(
  backend: MultiplayerBackendAdapter,
  profile: MultiplayerNetworkConditionProfile = {}
): MultiplayerNetworkConditionSimulator {
  const latencyMs = nonNegativeFinite(profile.latencyMs, 0);
  const jitterMs = nonNegativeFinite(profile.jitterMs, 0);
  const lossPercent = percentage(profile.lossPercent, 0);
  const duplicatePercent = percentage(profile.duplicatePercent, 0);
  const maxPendingDeliveries = positiveInteger(
    profile.maxPendingDeliveries,
    DEFAULT_MAX_PENDING_DELIVERIES
  );
  let randomState = normalizeSeed(profile.seed);
  let nowMs = 0;
  let nextDeliveryId = 0;
  let nextConnectionId = 0;
  let activeConnections = 0;
  let disposed = false;
  let lastDeliveryError: string | undefined;
  const pending: ScheduledDelivery[] = [];
  const lastOrderedDueAt = new Map<string, number>();
  const metrics = {
    scheduledDeliveries: 0,
    deliveredMessages: 0,
    droppedMessages: 0,
    duplicatedMessages: 0,
    capacityDrops: 0,
    deliveryErrors: 0,
    maxPendingDeliveries: 0
  };

  const simulatedBackend: MultiplayerBackendAdapter = {
    id: `${backend.id}.network-simulated`,
    kind: `${backend.kind}.network-simulated`,
    capabilities: structuredClone(backend.capabilities),
    async connect(context) {
      assertActive();
      const connectionId = ++nextConnectionId;
      const inner = await backend.connect(context);
      activeConnections += 1;
      let closed = false;
      const subscriptions = new Set<() => void>();
      const connection: MultiplayerBackendConnection = {
        createSession: (request) => inner.createSession(request),
        joinSession: (request) => inner.joinSession(request),
        leaveSession: (reason) => inner.leaveSession(reason),
        async send(message) {
          assertConnectionOpen();
          if (!shouldAffect("outgoing", message)) {
            await inner.send(message);
            return;
          }
          scheduleMessage(connectionId, "outgoing", message, () => inner.send(message));
        },
        subscribe(listener) {
          assertConnectionOpen();
          const unsubscribe = inner.subscribe((message) => {
            if (!shouldAffect("incoming", message)) {
              listener(cloneMessage(message));
              return;
            }
            scheduleMessage(connectionId, "incoming", message, () =>
              listener(cloneMessage(message))
            );
          });
          subscriptions.add(unsubscribe);
          return () => {
            subscriptions.delete(unsubscribe);
            unsubscribe();
          };
        },
        async close(reason) {
          if (closed) return;
          closed = true;
          for (const unsubscribe of subscriptions) unsubscribe();
          subscriptions.clear();
          removeOwnedDeliveries(connectionId);
          activeConnections = Math.max(0, activeConnections - 1);
          await inner.close(reason);
        },
        snapshot() {
          return inner.snapshot();
        }
      };
      return connection;

      function assertConnectionOpen(): void {
        assertActive();
        if (closed) throw new Error("Network-conditioned multiplayer connection is closed.");
      }
    },
    ...(backend.native === undefined ? {} : { native: () => backend.native?.() }),
    snapshot(): MultiplayerBackendSnapshot {
      const snapshot = backend.snapshot();
      return {
        ...snapshot,
        id: simulatedBackend.id,
        kind: simulatedBackend.kind,
        metadata: {
          ...snapshot.metadata,
          networkConditionSimulator: diagnostics()
        }
      };
    }
  };

  const simulator: MultiplayerNetworkConditionSimulator = {
    backend: simulatedBackend,
    async advance(deltaMs) {
      assertActive();
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new Error("Network-condition advance delta must be a non-negative finite number.");
      }
      nowMs += deltaMs;
      await deliverDue();
    },
    async flush() {
      assertActive();
      let iterations = 0;
      while (pending.length > 0) {
        if (iterations++ > maxPendingDeliveries * 2) {
          throw new Error("Network-condition simulator flush exceeded its delivery bound.");
        }
        const next = earliestDelivery();
        if (next === undefined) break;
        nowMs = Math.max(nowMs, next.dueAt);
        await deliverDue();
      }
    },
    diagnostics,
    dispose() {
      if (disposed) return;
      disposed = true;
      pending.length = 0;
      lastOrderedDueAt.clear();
    }
  };
  return simulator;

  function scheduleMessage(
    ownerId: number,
    direction: MultiplayerNetworkConditionDirection,
    message: MultiplayerMessageEnvelope,
    deliver: () => Promise<void> | void
  ): void {
    if (randomPercentage() < lossPercent) {
      metrics.droppedMessages += 1;
      return;
    }
    const orderKey = orderedDeliveryKey(ownerId, direction, message);
    schedule(ownerId, networkDelay(), deliver, orderKey);
    if (randomPercentage() < duplicatePercent) {
      metrics.duplicatedMessages += 1;
      schedule(ownerId, networkDelay(), deliver, orderKey);
    }
  }

  function shouldAffect(
    direction: MultiplayerNetworkConditionDirection,
    message: MultiplayerMessageEnvelope
  ): boolean {
    return profile.affects?.(direction, message) ?? direction === "outgoing";
  }

  function schedule(
    ownerId: number,
    delayMs: number,
    deliver: ScheduledDelivery["deliver"],
    orderKey?: string
  ): void {
    if (pending.length >= maxPendingDeliveries) {
      metrics.capacityDrops += 1;
      return;
    }
    let dueAt = nowMs + delayMs;
    if (orderKey !== undefined) {
      dueAt = Math.max(dueAt, lastOrderedDueAt.get(orderKey) ?? 0);
      lastOrderedDueAt.set(orderKey, dueAt);
    }
    pending.push({ id: ++nextDeliveryId, ownerId, dueAt, deliver });
    metrics.scheduledDeliveries += 1;
    metrics.maxPendingDeliveries = Math.max(metrics.maxPendingDeliveries, pending.length);
  }

  async function deliverDue(): Promise<void> {
    while (true) {
      const due = pending.filter((delivery) => delivery.dueAt <= nowMs).sort(compareDeliveries)[0];
      if (due === undefined) return;
      const index = pending.findIndex((delivery) => delivery.id === due.id);
      if (index >= 0) pending.splice(index, 1);
      try {
        await due.deliver();
        metrics.deliveredMessages += 1;
      } catch (error) {
        metrics.deliveryErrors += 1;
        lastDeliveryError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  function earliestDelivery(): ScheduledDelivery | undefined {
    return [...pending].sort(compareDeliveries)[0];
  }

  function removeOwnedDeliveries(ownerId: number): void {
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index]?.ownerId === ownerId) pending.splice(index, 1);
    }
    for (const key of lastOrderedDueAt.keys()) {
      if (key.startsWith(`${ownerId}:`)) lastOrderedDueAt.delete(key);
    }
  }

  function orderedDeliveryKey(
    ownerId: number,
    direction: MultiplayerNetworkConditionDirection,
    message: MultiplayerMessageEnvelope
  ): string | undefined {
    const channel = simulatedBackend.capabilities.channels.find(
      (candidate) => candidate.id === message.channel
    );
    return channel?.ordering === "ordered"
      ? `${ownerId}:${direction}:${message.channel}`
      : undefined;
  }

  function networkDelay(): number {
    return Math.max(0, latencyMs + (nextRandom() * 2 - 1) * jitterMs);
  }

  function randomPercentage(): number {
    return nextRandom() * 100;
  }

  function nextRandom(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x1_0000_0000;
  }

  function diagnostics(): MultiplayerNetworkConditionSimulatorDiagnostics {
    return {
      nowMs,
      pendingDeliveries: pending.length,
      ...metrics,
      ...(lastDeliveryError === undefined ? {} : { lastDeliveryError }),
      activeConnections,
      disposed
    };
  }

  function assertActive(): void {
    if (disposed) throw new Error("Multiplayer network-condition simulator is disposed.");
  }
}

function compareDeliveries(left: ScheduledDelivery, right: ScheduledDelivery): number {
  return left.dueAt - right.dueAt || left.id - right.id;
}

function cloneMessage(message: MultiplayerMessageEnvelope): MultiplayerMessageEnvelope {
  return structuredClone(message);
}

function nonNegativeFinite(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value);
}

function percentage(value: number | undefined, fallback: number): number {
  return Math.min(100, nonNegativeFinite(value, fallback));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isSafeInteger(value) || value <= 0 ? fallback : value;
}

function normalizeSeed(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value)) return 0x9e37_79b9;
  const seed = value >>> 0;
  return seed === 0 ? 0x9e37_79b9 : seed;
}
