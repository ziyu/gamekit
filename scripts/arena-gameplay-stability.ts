import { performance } from "node:perf_hooks";

import {
  createMultiplayerFixedStepInputBundle,
  createMultiplayerNetworkConditionSimulator,
  createMultiplayerRuntime,
  type MultiplayerFixedStepInputFrame,
  type MultiplayerRuntime
} from "../packages/multiplayer-core/src";
import { createMemoryMultiplayerBackend } from "../packages/multiplayer-memory/src";
import { initRapier3dPhysicsBackend } from "../packages/physics-rapier3d/src";
import { prepareArenaBotNavigationRuntime } from "../apps/multiplayer-physics-arena-demo/src/ai/navigation";
import { ARENA_COMPILED_CONTENT } from "../apps/multiplayer-physics-arena-demo/src/content/default-content";
import { createArenaAuthorityRuntime } from "../apps/multiplayer-physics-arena-demo/src/server/arena-authority";
import {
  ARENA_ACTION_KIND,
  ARENA_FIXED_STEP_MS,
  ARENA_INPUT_KIND,
  ARENA_SNAPSHOT_KIND
} from "../apps/multiplayer-physics-arena-demo/src/shared/config";
import { arenaParticipantCommandEpoch } from "../apps/multiplayer-physics-arena-demo/src/shared/arena-identity";
import {
  readArenaSnapshot,
  type ArenaPublicParticipantState,
  type ArenaSnapshot
} from "../apps/multiplayer-physics-arena-demo/src/shared/protocol";

const SIMULATED_MINUTES = 10;
const TICKS_PER_MINUTE = 60 * 60;
const SIMULATED_TICKS = SIMULATED_MINUTES * TICKS_PER_MINUTE;
const WARMUP_TICKS = 10 * 60;
const SAMPLE_INTERVAL_TICKS = 10 * 60;
const MAX_RETAINED_HEAP_GROWTH_BYTES = 32 * 1024 * 1024;
const MAX_PEAK_RETAINED_HEAP_GROWTH_BYTES = 48 * 1024 * 1024;
const forceGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;

if (forceGc === undefined) {
  throw new Error("Arena gameplay stability requires Node.js --expose-gc.");
}

let faultEnabled = false;
const multiplayer = createMemoryMultiplayerBackend({ id: "arena-gameplay-stability" });
const simulator = createMultiplayerNetworkConditionSimulator(multiplayer, {
  latencyMs: 150,
  jitterMs: 50,
  lossPercent: 5,
  duplicatePercent: 2,
  seed: 7_303,
  maxPendingDeliveries: 2_048,
  affects: (direction, message) =>
    faultEnabled &&
    direction === "outgoing" &&
    (message.kind === ARENA_INPUT_KIND ||
      message.kind === ARENA_ACTION_KIND ||
      message.kind === ARENA_SNAPSHOT_KIND)
});
const sessionId = "arena-gameplay-stability.session";
const authorityPeerId = `${sessionId}.server`;
const host = createMultiplayerRuntime({
  id: "arena-gameplay-stability.host",
  backend: simulator.backend,
  connectContext: { localPeer: { id: authorityPeerId, role: "server" } }
});
const clients = [
  createClient("arena-gameplay-stability.client-a", "peer.stability.a"),
  createClient("arena-gameplay-stability.client-b", "peer.stability.b")
];

await host.createSession({
  id: sessionId,
  kind: "private",
  authority: "server-authoritative",
  localPeer: { id: authorityPeerId, role: "server" }
});
await Promise.all(
  clients.map(({ runtime, peerId }) =>
    runtime.joinSession({ sessionId, localPeer: { id: peerId, role: "client" } })
  )
);

const backend = await initRapier3dPhysicsBackend({
  id: "stability.arena-gameplay.rapier3d",
  groups: { "arena-item": 0b001, "arena-actor": 0b010, "arena-world": 0b100 }
});
const navigation = await prepareArenaBotNavigationRuntime(ARENA_COMPILED_CONTENT);
let virtualTick = 0;
const authority = createArenaAuthorityRuntime({
  runtime: host,
  backend,
  navigation,
  sessionId,
  authorityPeerId,
  now: () => virtualTick * ARENA_FIXED_STEP_MS
});

let latestSnapshot: ArenaSnapshot | undefined;
let observedSnapshots = 0;
let invalidSnapshots = 0;
let maxSnapshotGapTicks = 0;
let previousSnapshotTick: number | undefined;
let maxSnapshotPayloadBytes = 0;
let faultSwitches = 0;
let itemStateTransitions = 0;
let previousItemStates = new Map<string, string>();
const observedRounds = new Set<number>();
const observedStages = new Set<number>();
const observedStageInstances = new Set<string>();
const observedGenerations = new Set<string>();
const observedWinners = new Set<string>();
const observedItemActions = new Set<string>();
const observedCombatHits = new Set<string>();
const subscriptions = clients.map(({ runtime }, index) =>
  runtime.subscribe((message) => {
    if (message.kind !== ARENA_SNAPSHOT_KIND) return;
    const snapshot = readArenaSnapshot(message.payload);
    if (snapshot === undefined) {
      invalidSnapshots += 1;
      return;
    }
    observedSnapshots += 1;
    if (index !== 0) return;
    latestSnapshot = snapshot;
    if (previousSnapshotTick !== undefined) {
      maxSnapshotGapTicks = Math.max(
        maxSnapshotGapTicks,
        snapshot.frame.tick - previousSnapshotTick
      );
    }
    previousSnapshotTick = snapshot.frame.tick;
    maxSnapshotPayloadBytes = Math.max(
      maxSnapshotPayloadBytes,
      Buffer.byteLength(JSON.stringify(snapshot), "utf8")
    );
    observedRounds.add(snapshot.round);
    observedStages.add(snapshot.match.stageIndex);
    observedStageInstances.add(snapshot.match.stageInstanceId);
    observedGenerations.add(String(snapshot.frame.generation));
    if (snapshot.winnerId !== undefined) observedWinners.add(snapshot.winnerId);
    for (const action of snapshot.itemActions) observedItemActions.add(action.id);
    for (const hit of snapshot.combat.hits) observedCombatHits.add(hit.id);
    const nextItemStates = new Map<string, string>();
    for (const item of snapshot.items) {
      const state = `${item.instanceGeneration}:${item.state}:${item.revision}`;
      nextItemStates.set(item.id, state);
      const previous = previousItemStates.get(item.id);
      if (previous !== undefined && previous !== state) itemStateTransitions += 1;
    }
    previousItemStates = nextItemStates;
  })
);

const pendingInputs = new Map<
  string,
  { epoch: string; frames: Map<number, MultiplayerFixedStepInputFrame> }
>();
const inputSequencesByPeerId = new Map<string, number>();
let sentInputs = 0;
let throttledInputs = 0;
let sentActions = 0;
let maxPhysicsMembers = 0;
let maxPhysicsHistoryEntries = 0;
let maxPhysicsHistoryBytes = 0;
let maxPhysicsCommands = 0;
let maxAiAgents = 0;
let maxAiMemoryFacts = 0;
let maxAiTraceEntries = 0;
let maxAiPendingActions = 0;
let maxNavigationPending = 0;
let maxNavigationRoutes = 0;

for (let tick = 1; tick <= WARMUP_TICKS; tick += 1) await runTick(tick, false);
forceGc();
const baselineMemory = process.memoryUsage();
let peakHeapBytes = baselineMemory.heapUsed;
const startedAt = performance.now();

for (let offset = 1; offset <= SIMULATED_TICKS; offset += 1) {
  const nextFaultEnabled = Math.floor((offset - 1) / TICKS_PER_MINUTE) % 2 === 1;
  if (nextFaultEnabled !== faultEnabled) {
    faultEnabled = nextFaultEnabled;
    faultSwitches += 1;
  }
  await runTick(WARMUP_TICKS + offset, true);
  if (offset % SAMPLE_INTERVAL_TICKS === 0) {
    sampleRuntimeBounds();
    forceGc();
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  }
}

await simulator.flush();
await Promise.resolve();
sampleRuntimeBounds();
forceGc();
const durationMs = performance.now() - startedAt;
const finalMemory = process.memoryUsage();
const beforeDispose = authority.snapshot();
const networkBeforeDispose = simulator.diagnostics();
const retainedHeapGrowthBytes = Math.max(0, finalMemory.heapUsed - baselineMemory.heapUsed);
const peakRetainedHeapGrowthBytes = Math.max(0, peakHeapBytes - baselineMemory.heapUsed);

authority.dispose();
const retained = authority.retainedState();
for (const unsubscribe of subscriptions) unsubscribe();
await Promise.all(clients.map(({ runtime }) => runtime.dispose()));
await host.dispose();
const networkAfterDispose = simulator.diagnostics();
simulator.dispose();
forceGc();

const retainedAfterDispose = Object.entries(retained).reduce(
  (total, [key, value]) =>
    key === "disposed" || typeof value !== "number" ? total : total + value,
  0
);
const inputCapacityRejections =
  beforeDispose.input.fixedStepInput.frameCapacityRejections +
  beforeDispose.input.fixedStepInput.sourceCapacityRejections;
const failures: string[] = [];

checkAtMost("final retained heap growth", retainedHeapGrowthBytes, MAX_RETAINED_HEAP_GROWTH_BYTES);
checkAtMost(
  "peak retained heap growth",
  peakRetainedHeapGrowthBytes,
  MAX_PEAK_RETAINED_HEAP_GROWTH_BYTES
);
checkAtMost("physics members", maxPhysicsMembers, 32);
checkAtMost("physics history entries", maxPhysicsHistoryEntries, 1);
checkAtMost("physics history bytes", maxPhysicsHistoryBytes, 512 * 1024);
checkAtMost("physics commands", maxPhysicsCommands, 2_048);
checkAtMost("AI agents", maxAiAgents, 8);
checkAtMost("AI memory facts", maxAiMemoryFacts, 8 * 32);
checkAtMost("AI trace entries", maxAiTraceEntries, 256);
checkAtMost("AI pending actions", maxAiPendingActions, 32);
checkAtMost("navigation pending requests", maxNavigationPending, 24);
checkAtMost("navigation retained routes", maxNavigationRoutes, 16);
checkAtMost("snapshot payload", maxSnapshotPayloadBytes, 64 * 1024);
checkAtMost("maximum snapshot gap", maxSnapshotGapTicks, 30);
checkAtMost("invalid snapshots", invalidSnapshots, 0);
checkAtMost("input capacity rejections", inputCapacityRejections, 0);
checkAtMost("network capacity drops", networkBeforeDispose.capacityDrops, 0);
checkAtMost("network delivery errors", networkBeforeDispose.deliveryErrors, 0);
checkAtMost("network pending after dispose", networkAfterDispose.pendingDeliveries, 0);
checkAtMost("network connections after dispose", networkAfterDispose.activeConnections, 0);
checkAtMost("replay budget overflows", beforeDispose.physics.replayBudgetOverflows, 0);
checkAtMost("checkpoint byte overflows", beforeDispose.physics.checkpointByteOverflows, 0);
checkAtMost("retained state after dispose", retainedAfterDispose, 0);
checkAtLeast("observed rounds", observedRounds.size, 2);
checkAtLeast("observed stages", observedStages.size, ARENA_COMPILED_CONTENT.stages.length);
checkAtLeast("observed stage instances", observedStageInstances.size, 4);
checkAtLeast("observed generations", observedGenerations.size, 4);
checkAtLeast("observed winners", observedWinners.size, 1);
checkAtLeast("fault profile switches", faultSwitches, SIMULATED_MINUTES - 1);
checkAtLeast("dropped network messages", networkBeforeDispose.droppedMessages, 1);
checkAtLeast("duplicated network messages", networkBeforeDispose.duplicatedMessages, 1);
checkAtLeast("AI goal selections", beforeDispose.ai.behavior.goalSelections, 1);
checkAtLeast("AI movement intents", beforeDispose.ai.behavior.movementIntents, 1);
checkAtLeast("AI action intents", beforeDispose.ai.behavior.actionIntents, 1);
checkAtLeast("item state transitions", itemStateTransitions, 1);
checkAtLeast("observed item actions", observedItemActions.size, 1);

console.log(
  JSON.stringify(
    {
      benchmark: "arena-gameplay-stability",
      methodology: {
        backend: "real Rapier3D compat WASM + Recast WASM + in-memory multiplayer transport",
        profile: "two human peers, six authority bots, full match/rematch, item/combat/AI/Nav",
        network:
          "alternates every simulated minute between baseline and 150ms latency / 50ms jitter / 5% loss / 2% duplicates",
        sampling: "forced GC after warmup and every ten simulated seconds"
      },
      simulatedMinutes: SIMULATED_MINUTES,
      ticks: SIMULATED_TICKS,
      durationMs: round(durationMs),
      observedSnapshots,
      invalidSnapshots,
      observedRounds: [...observedRounds].sort((left, right) => left - right),
      observedStages: [...observedStages].sort((left, right) => left - right),
      observedStageInstances: observedStageInstances.size,
      observedGenerations: observedGenerations.size,
      observedWinners: [...observedWinners],
      sentInputs,
      throttledInputs,
      acceptedInputs: beforeDispose.input.fixedStepInput.acceptedFrames,
      rejectedInputs: beforeDispose.input.fixedStepInput.rejectedFrames,
      sentActions,
      itemStateTransitions,
      observedItemActions: observedItemActions.size,
      observedCombatHits: observedCombatHits.size,
      ai: {
        maxAgents: maxAiAgents,
        maxMemoryFacts: maxAiMemoryFacts,
        maxTraceEntries: maxAiTraceEntries,
        maxPendingActions: maxAiPendingActions,
        goalSelections: beforeDispose.ai.behavior.goalSelections,
        movementIntents: beforeDispose.ai.behavior.movementIntents,
        actionIntents: beforeDispose.ai.behavior.actionIntents
      },
      navigation: {
        maxPendingRequests: maxNavigationPending,
        maxRetainedRoutes: maxNavigationRoutes,
        stageChanges: beforeDispose.navigation?.stageChanges ?? 0
      },
      physics: {
        maxMembers: maxPhysicsMembers,
        maxHistoryEntries: maxPhysicsHistoryEntries,
        maxHistoryBytes: maxPhysicsHistoryBytes,
        maxCommands: maxPhysicsCommands,
        replayBudgetOverflows: beforeDispose.physics.replayBudgetOverflows,
        checkpointByteOverflows: beforeDispose.physics.checkpointByteOverflows
      },
      network: {
        faultSwitches,
        maxSnapshotGapTicks,
        maxSnapshotPayloadBytes,
        droppedMessages: networkBeforeDispose.droppedMessages,
        duplicatedMessages: networkBeforeDispose.duplicatedMessages,
        capacityDrops: networkBeforeDispose.capacityDrops,
        deliveryErrors: networkBeforeDispose.deliveryErrors,
        pendingAfterDispose: networkAfterDispose.pendingDeliveries,
        connectionsAfterDispose: networkAfterDispose.activeConnections
      },
      memory: {
        baselineHeapMiB: toMiB(baselineMemory.heapUsed),
        finalHeapMiB: toMiB(finalMemory.heapUsed),
        retainedHeapGrowthMiB: toMiB(retainedHeapGrowthBytes),
        peakRetainedHeapGrowthMiB: toMiB(peakRetainedHeapGrowthBytes),
        finalExternalMiB: toMiB(finalMemory.external),
        finalArrayBuffersMiB: toMiB(finalMemory.arrayBuffers)
      },
      retainedAfterDispose,
      passed: failures.length === 0,
      failures
    },
    null,
    2
  )
);

if (failures.length > 0) process.exitCode = 1;

async function runTick(tick: number, driveClients: boolean): Promise<void> {
  virtualTick = tick;
  if (driveClients && latestSnapshot !== undefined) {
    await sendInputs(latestSnapshot, tick);
    if (latestSnapshot.phase === "running" && tick % 90 === 0) {
      await sendActions(latestSnapshot, tick);
    }
  }
  await simulator.advance(ARENA_FIXED_STEP_MS);
  authority.tick();
  await simulator.advance(0);
}

async function sendInputs(snapshot: ArenaSnapshot, tick: number): Promise<void> {
  const sends: Promise<void>[] = [];
  for (const [index, client] of clients.entries()) {
    const participant = snapshot.participants.find((entry) => entry.peerId === client.peerId);
    if (!canReceiveInput(participant)) continue;
    const epoch = arenaParticipantCommandEpoch(snapshot.frame.generation, participant.revision);
    let pending = pendingInputs.get(client.peerId);
    if (pending === undefined || pending.epoch !== epoch) {
      pending = { epoch, frames: new Map() };
      pendingInputs.set(client.peerId, pending);
    }
    const ack = snapshot.inputAcksByPeerId[client.peerId] ?? 0;
    for (const sequence of pending.frames.keys()) {
      if (sequence <= ack) pending.frames.delete(sequence);
    }
    if (pending.frames.size >= 8) {
      throttledInputs += 1;
      continue;
    }
    const movement = movementFor(snapshot, participant, index, tick);
    const sequence = (inputSequencesByPeerId.get(client.peerId) ?? 0) + 1;
    inputSequencesByPeerId.set(client.peerId, sequence);
    const frame: MultiplayerFixedStepInputFrame = {
      sequence,
      payload: {
        sequence,
        moveX: movement.x,
        moveZ: movement.z,
        jump: tick % (90 + index * 15) === 0,
        authorityEpoch: epoch
      }
    };
    pending.frames.set(sequence, frame);
    const ordered = [...pending.frames.values()].sort(
      (left, right) => left.sequence - right.sequence
    );
    const redundant = ordered.length <= 6 ? ordered : [...ordered.slice(0, 5), frame];
    sends.push(
      client.runtime.send({
        channel: "reliable",
        kind: ARENA_INPUT_KIND,
        payload: createMultiplayerFixedStepInputBundle(redundant)
      })
    );
    sentInputs += 1;
  }
  await Promise.all(sends);
}

async function sendActions(snapshot: ArenaSnapshot, tick: number): Promise<void> {
  const sends: Promise<void>[] = [];
  for (const [index, client] of clients.entries()) {
    const participant = snapshot.participants.find((entry) => entry.peerId === client.peerId);
    if (participant?.status !== "active" || participant.actorMemberId === undefined) continue;
    const actor = snapshot.frame.members.find((member) => member.id === participant.actorMemberId);
    if (actor === undefined) continue;
    const held = snapshot.items.find(
      (item) => item.ownerParticipantId === participant.id && item.state === "carried"
    );
    const worldItem = snapshot.items.find((item) => item.state === "world");
    const itemBody = snapshot.frame.members.find((member) => member.id === worldItem?.bodyMemberId);
    if (
      held === undefined &&
      (worldItem === undefined ||
        itemBody === undefined ||
        Math.hypot(
          itemBody.body.position.x - actor.body.position.x,
          (itemBody.body.position.z ?? 0) - (actor.body.position.z ?? 0)
        ) > 2.7)
    ) {
      continue;
    }
    const commandId = `${client.peerId}.stability.${tick}`;
    const target = aimTarget(snapshot, participant, index);
    const type = held === undefined ? "interact" : "use";
    sends.push(
      client.runtime.send({
        id: commandId,
        correlationId: commandId,
        channel: "reliable",
        kind: ARENA_ACTION_KIND,
        payload: {
          type,
          commandId,
          inputSequence: inputSequencesByPeerId.get(client.peerId) ?? 0,
          aimX: target.x,
          aimZ: target.z,
          charge: type === "use" ? 1 : 0,
          authorityEpoch: arenaParticipantCommandEpoch(
            snapshot.frame.generation,
            participant.revision
          ),
          ...(type === "interact" && worldItem !== undefined
            ? {
                targetItemId: worldItem.id,
                targetItemGeneration: worldItem.instanceGeneration
              }
            : {})
        }
      })
    );
    sentActions += 1;
  }
  await Promise.all(sends);
}

function movementFor(
  snapshot: ArenaSnapshot,
  participant: ArenaPublicParticipantState,
  index: number,
  tick: number
): { x: number; z: number } {
  const actor = snapshot.frame.members.find((member) => member.id === participant.actorMemberId);
  const item = snapshot.items.find((entry) => entry.state === "world");
  const target = snapshot.frame.members.find((member) => member.id === item?.bodyMemberId);
  if (actor !== undefined && target !== undefined) {
    const x = target.body.position.x - actor.body.position.x;
    const z = (target.body.position.z ?? 0) - (actor.body.position.z ?? 0);
    const length = Math.hypot(x, z);
    if (length > 0.15) return { x: x / length, z: z / length };
  }
  const phase = tick * 0.012 + index * Math.PI;
  return { x: Math.sin(phase) * 0.65, z: -0.76 };
}

function aimTarget(
  snapshot: ArenaSnapshot,
  participant: ArenaPublicParticipantState,
  index: number
): { x: number; z: number } {
  const actor = snapshot.frame.members.find((member) => member.id === participant.actorMemberId);
  const targetParticipant = snapshot.participants.find(
    (candidate) =>
      candidate.id !== participant.id &&
      candidate.status === "active" &&
      candidate.actorMemberId !== undefined
  );
  const target = snapshot.frame.members.find(
    (member) => member.id === targetParticipant?.actorMemberId
  );
  if (actor === undefined || target === undefined) {
    return { x: index === 0 ? 0.35 : -0.35, z: -1 };
  }
  const x = target.body.position.x - actor.body.position.x;
  const z = (target.body.position.z ?? 0) - (actor.body.position.z ?? 0);
  const length = Math.hypot(x, z);
  return length <= 0.001 ? { x: 0, z: -1 } : { x: x / length, z: z / length };
}

function canReceiveInput(
  participant: ArenaPublicParticipantState | undefined
): participant is ArenaPublicParticipantState {
  return (
    participant !== undefined &&
    participant.connected &&
    participant.actorMemberId !== undefined &&
    participant.status !== "spectator" &&
    participant.status !== "next-match" &&
    participant.status !== "eliminated" &&
    participant.status !== "finished" &&
    participant.status !== "disconnected"
  );
}

function sampleRuntimeBounds(): void {
  const snapshot = authority.snapshot();
  maxPhysicsMembers = Math.max(maxPhysicsMembers, snapshot.physics.members);
  maxPhysicsHistoryEntries = Math.max(maxPhysicsHistoryEntries, snapshot.physics.historyEntries);
  maxPhysicsHistoryBytes = Math.max(maxPhysicsHistoryBytes, snapshot.physics.historyBytes);
  maxPhysicsCommands = Math.max(maxPhysicsCommands, snapshot.physics.commands);
  maxAiAgents = Math.max(maxAiAgents, snapshot.ai.agents);
  maxAiMemoryFacts = Math.max(maxAiMemoryFacts, snapshot.ai.memoryFacts);
  maxAiTraceEntries = Math.max(maxAiTraceEntries, snapshot.ai.traceEntries);
  maxAiPendingActions = Math.max(maxAiPendingActions, snapshot.ai.pendingActions);
  maxNavigationPending = Math.max(maxNavigationPending, snapshot.navigation?.pendingRequests ?? 0);
  maxNavigationRoutes = Math.max(maxNavigationRoutes, snapshot.navigation?.retainedRoutes ?? 0);
}

function createClient(id: string, peerId: string): { runtime: MultiplayerRuntime; peerId: string } {
  return {
    peerId,
    runtime: createMultiplayerRuntime({
      id,
      backend: simulator.backend,
      connectContext: { localPeer: { id: peerId, role: "client" } }
    })
  };
}

function checkAtMost(label: string, actual: number, maximum: number): void {
  if (actual > maximum) failures.push(`${label} exceeded ${maximum} (actual ${actual})`);
}

function checkAtLeast(label: string, actual: number, minimum: number): void {
  if (actual < minimum) failures.push(`${label} was below ${minimum} (actual ${actual})`);
}

function toMiB(bytes: number): number {
  return round(bytes / (1024 * 1024));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
