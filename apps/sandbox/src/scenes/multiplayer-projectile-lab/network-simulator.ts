import type { MultiplayerProjectileLabNetworkConfig } from "./types";

export type MultiplayerProjectileLabNetworkLane = "command" | "owner-record" | "remote-record";

export type MultiplayerProjectileLabNetworkDiagnostics = {
  scheduled: number;
  delivered: number;
  duplicated: number;
  reordered: number;
  flushed: number;
};

export type MultiplayerProjectileLabNetworkSimulator = {
  enqueue<TPayload>(lane: MultiplayerProjectileLabNetworkLane, payload: TPayload): void;
  drain<TPayload>(
    lane: MultiplayerProjectileLabNetworkLane,
    consume: (payload: TPayload) => void
  ): void;
  setConfig(config: MultiplayerProjectileLabNetworkConfig): void;
  setPartitioned(partitioned: boolean): void;
  flush(): void;
  clear(): void;
  depth(lane?: MultiplayerProjectileLabNetworkLane): number;
  diagnostics(): MultiplayerProjectileLabNetworkDiagnostics;
};

type ScheduledPacket = {
  serial: number;
  deliverAt: number;
  payload: unknown;
};

const LANES: readonly MultiplayerProjectileLabNetworkLane[] = [
  "command",
  "owner-record",
  "remote-record"
];

export function createMultiplayerProjectileLabNetworkSimulator(options: {
  now(): number;
  config: MultiplayerProjectileLabNetworkConfig;
}): MultiplayerProjectileLabNetworkSimulator {
  let config = { ...options.config };
  let serial = 0;
  const queues = new Map(LANES.map((lane) => [lane, [] as ScheduledPacket[]] as const));
  const diagnostics: MultiplayerProjectileLabNetworkDiagnostics = {
    scheduled: 0,
    delivered: 0,
    duplicated: 0,
    reordered: 0,
    flushed: 0
  };

  return {
    enqueue(lane, payload) {
      const queue = requireQueue(lane);
      serial += 1;
      const originalSerial = serial;
      const reorderDelay = config.reorderMs > 0 && originalSerial % 2 === 1 ? config.reorderMs : 0;
      if (reorderDelay > 0) {
        diagnostics.reordered += 1;
      }
      queue.push({
        serial: originalSerial,
        deliverAt:
          options.now() + config.latencyMs / 2 + deterministicJitter(originalSerial) + reorderDelay,
        payload
      });
      diagnostics.scheduled += 1;
      if (config.duplicateEvery > 0 && originalSerial % config.duplicateEvery === 0) {
        serial += 1;
        queue.push({
          serial,
          deliverAt:
            options.now() +
            config.latencyMs / 2 +
            deterministicJitter(originalSerial) +
            reorderDelay +
            1,
          payload
        });
        diagnostics.scheduled += 1;
        diagnostics.duplicated += 1;
      }
      queue.sort(comparePackets);
    },
    drain(lane, consume) {
      if (config.partitioned) {
        return;
      }
      const queue = requireQueue(lane);
      let read = 0;
      while (read < queue.length && queue[read]!.deliverAt <= options.now()) {
        consume(queue[read]!.payload as never);
        diagnostics.delivered += 1;
        read += 1;
      }
      if (read > 0) {
        queue.splice(0, read);
      }
    },
    setConfig(nextConfig) {
      config = { ...nextConfig };
    },
    setPartitioned(partitioned) {
      config = { ...config, partitioned };
    },
    flush() {
      config = { ...config, partitioned: false };
      const now = options.now();
      for (const queue of queues.values()) {
        for (const packet of queue) {
          packet.deliverAt = now;
        }
        queue.sort(comparePackets);
      }
      diagnostics.flushed += 1;
    },
    clear() {
      for (const queue of queues.values()) {
        queue.length = 0;
      }
      serial = 0;
      diagnostics.scheduled = 0;
      diagnostics.delivered = 0;
      diagnostics.duplicated = 0;
      diagnostics.reordered = 0;
      diagnostics.flushed = 0;
    },
    depth(lane) {
      if (lane !== undefined) {
        return requireQueue(lane).length;
      }
      let total = 0;
      for (const queue of queues.values()) {
        total += queue.length;
      }
      return total;
    },
    diagnostics() {
      return { ...diagnostics };
    }
  };

  function requireQueue(lane: MultiplayerProjectileLabNetworkLane): ScheduledPacket[] {
    const queue = queues.get(lane);
    if (queue === undefined) {
      throw new Error(`Unknown multiplayer projectile network lane: ${lane}`);
    }
    return queue;
  }

  function deterministicJitter(packetSerial: number): number {
    if (config.jitterMs <= 0) {
      return 0;
    }
    const hash = (packetSerial * 48_271) % 2_147_483_647;
    const unit = hash / 2_147_483_647;
    return (unit * 2 - 1) * config.jitterMs;
  }
}

function comparePackets(left: ScheduledPacket, right: ScheduledPacket): number {
  return left.deliverAt - right.deliverAt || left.serial - right.serial;
}
