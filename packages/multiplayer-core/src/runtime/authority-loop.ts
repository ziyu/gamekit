import { createMultiplayerAuthorityBindingStore } from "./authority-binding";
import {
  MULTIPLAYER_ACTION_KIND,
  MULTIPLAYER_AUTHORITY_CHANNEL,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND,
  type MultiplayerAuthorityBinding,
  type MultiplayerAuthorityBindingInput,
  type MultiplayerAuthorityBindingStore,
  type MultiplayerAuthorityLocalContext,
  type MultiplayerAuthorityMessageContext,
  type MultiplayerAuthorityRejectedPayload,
  type MultiplayerAuthoritySnapshotContext,
  type MultiplayerAuthorityTickContext
} from "./authority-types";
import type {
  MultiplayerAuthorityDecision,
  MultiplayerMessageEnvelope,
  MultiplayerRuntime
} from "./types";

type QueuedPayload<TPayload> = {
  message: MultiplayerMessageEnvelope;
  payload: TPayload;
};

type QueuedAction<TAction> = QueuedPayload<TAction> & {
  sourceKey: string;
};

type QueuedInput<TInput> = QueuedPayload<TInput> & {
  sourceKey: string;
};

export type MultiplayerAuthorityInputQueueMode = "fifo" | "latest";

export type MultiplayerAuthorityHostLoopOptions<TAction, TInput, TSnapshot> = {
  runtime: MultiplayerRuntime;
  binding: MultiplayerAuthorityBindingStore;
  channel?: string;
  actionKind?: string;
  inputKind?: string;
  snapshotKind?: string;
  snapshotVersion?: string;
  readAction?(payload: unknown, message: MultiplayerMessageEnvelope): TAction | undefined;
  readInput?(payload: unknown, message: MultiplayerMessageEnvelope): TInput | undefined;
  inputSequence?(input: TInput, message: MultiplayerMessageEnvelope): number | undefined;
  inputSequenceKey?(input: TInput, message: MultiplayerMessageEnvelope): string;
  maxActionsPerSourcePerTick?: number;
  maxQueuedActionsPerSource?: number;
  inputQueueMode?: MultiplayerAuthorityInputQueueMode;
  maxInputsPerSourcePerTick?: number;
  maxQueuedInputsPerSource?: number;
  handleAction?(
    ctx: MultiplayerAuthorityMessageContext<TAction>
  ): MultiplayerAuthorityDecision | void;
  handleInput?(
    ctx: MultiplayerAuthorityMessageContext<TInput>
  ): MultiplayerAuthorityDecision | void;
  tick?(ctx: MultiplayerAuthorityTickContext): void;
  captureSnapshot(ctx: MultiplayerAuthoritySnapshotContext): TSnapshot;
  publishSnapshot?(
    snapshot: TSnapshot,
    ctx: MultiplayerAuthoritySnapshotContext
  ): void | Promise<void>;
  onRejected?(rejection: MultiplayerAuthorityRejectedPayload): void;
};

export type MultiplayerAuthorityLoopDiagnostics = {
  tick: number;
  receivedActions: number;
  acceptedActions: number;
  rejectedActions: number;
  queuedActions: number;
  maxQueuedActions: number;
  receivedInputs: number;
  acceptedInputs: number;
  rejectedInputs: number;
  coalescedInputs: number;
  queuedInputs: number;
  maxQueuedInputs: number;
  sentSnapshots: number;
  rejectedMessages: number;
  lastRejected?: MultiplayerAuthorityRejectedPayload;
  lastBroadcastError?: string;
};

export type MultiplayerAuthorityHostLoop = {
  tick(deltaMs?: number): void;
  broadcastSnapshot(): Promise<void>;
  releasePeer(peerId: string): void;
  diagnostics(): MultiplayerAuthorityLoopDiagnostics;
  dispose(): void;
};

export type MultiplayerLocalAuthorityLoopOptions<TAction, TInput, TSnapshot> = {
  binding: MultiplayerAuthorityBindingInput;
  readAction?(payload: unknown): TAction | undefined;
  readInput?(payload: unknown): TInput | undefined;
  inputSequence?(input: TInput): number | undefined;
  inputSequenceKey?(input: TInput): string;
  handleAction?(
    ctx: MultiplayerAuthorityLocalContext<TAction>
  ): MultiplayerAuthorityDecision | void;
  handleInput?(ctx: MultiplayerAuthorityLocalContext<TInput>): MultiplayerAuthorityDecision | void;
  tick?(ctx: MultiplayerAuthorityTickContext): void;
  captureSnapshot(ctx: MultiplayerAuthoritySnapshotContext): TSnapshot;
  applySnapshot?(snapshot: TSnapshot, ctx: MultiplayerAuthoritySnapshotContext): void;
  onRejected?(rejection: MultiplayerAuthorityRejectedPayload): void;
};

export type MultiplayerLocalAuthorityLoop<TAction, TInput, TSnapshot> = {
  binding(): MultiplayerAuthorityBinding;
  dispatchAction(action: TAction): MultiplayerAuthorityDecision;
  dispatchInput(input: TInput): MultiplayerAuthorityDecision;
  tick(deltaMs?: number): void;
  snapshot(): TSnapshot;
  diagnostics(): MultiplayerAuthorityLoopDiagnostics;
};

export function createMultiplayerAuthorityHostLoop<TAction, TInput, TSnapshot>(
  options: MultiplayerAuthorityHostLoopOptions<TAction, TInput, TSnapshot>
): MultiplayerAuthorityHostLoop {
  const channel = options.channel ?? MULTIPLAYER_AUTHORITY_CHANNEL;
  const actionKind = options.actionKind ?? MULTIPLAYER_ACTION_KIND;
  const inputKind = options.inputKind ?? MULTIPLAYER_INPUT_KIND;
  const snapshotKind = options.snapshotKind ?? MULTIPLAYER_SNAPSHOT_KIND;
  const maxActionsPerSourcePerTick = normalizePerSourceLimit(options.maxActionsPerSourcePerTick, 8);
  const maxQueuedActionsPerSource = normalizeQueueLimit(
    options.maxQueuedActionsPerSource,
    maxActionsPerSourcePerTick,
    32
  );
  const inputQueueMode = options.inputQueueMode ?? "fifo";
  const maxInputsPerSourcePerTick = normalizeMaxInputsPerSourcePerTick(
    options.maxInputsPerSourcePerTick
  );
  const maxQueuedInputsPerSource = normalizeMaxQueuedInputsPerSource(
    options.maxQueuedInputsPerSource,
    maxInputsPerSourcePerTick
  );
  const actionQueue: Array<QueuedAction<TAction>> = [];
  const queuedActionsBySource = new Map<string, number>();
  const inputQueue: Array<QueuedInput<TInput>> = [];
  const queuedInputsBySource = new Map<string, number>();
  const latestQueuedInputBySource = new Map<string, QueuedInput<TInput>>();
  const inputSequences = new Map<string, number>();
  const inputSequenceKeysByPeerId = new Map<string, Set<string>>();
  const inputSequencePeerIdsByKey = new Map<string, string>();
  const diagnostics: MultiplayerAuthorityLoopDiagnostics = createDiagnostics();

  const unsubscribe = options.runtime.subscribe((message) => {
    if (message.kind === actionKind) {
      diagnostics.receivedActions += 1;
      enqueueAction(message);
      return;
    }

    if (message.kind === inputKind) {
      diagnostics.receivedInputs += 1;
      enqueueInput(message);
    }
  });

  function enqueueAction(message: MultiplayerMessageEnvelope): void {
    const decision = acceptsClientMessage(options.binding.current(), message);
    if (!decision.allowed) {
      rejectMessage(message, decision.code, decision.reason);
      diagnostics.rejectedActions += 1;
      return;
    }

    const payload = options.readAction
      ? options.readAction(message.payload, message)
      : (message.payload as TAction);
    if (payload === undefined) {
      rejectMessage(message, "invalid-action", "Action payload could not be decoded.");
      diagnostics.rejectedActions += 1;
      return;
    }

    const sourceKey = message.sourcePeerId;
    const queuedForSource = queuedActionsBySource.get(sourceKey) ?? 0;
    if (queuedForSource >= maxQueuedActionsPerSource) {
      rejectMessage(message, "action-queue-full", "Action queue is full for this source.");
      diagnostics.rejectedActions += 1;
      return;
    }

    actionQueue.push({ message, payload, sourceKey });
    queuedActionsBySource.set(sourceKey, queuedForSource + 1);
    refreshQueueDiagnostics();
  }

  function enqueueInput(message: MultiplayerMessageEnvelope): void {
    const decision = acceptsClientMessage(options.binding.current(), message);
    if (!decision.allowed) {
      rejectMessage(message, decision.code, decision.reason);
      diagnostics.rejectedInputs += 1;
      return;
    }

    const payload = options.readInput
      ? options.readInput(message.payload, message)
      : (message.payload as TInput);
    if (payload === undefined) {
      rejectMessage(message, "invalid-input", "Input payload could not be decoded.");
      diagnostics.rejectedInputs += 1;
      return;
    }

    const sourceKey = options.inputSequenceKey?.(payload, message) ?? message.sourcePeerId;
    const queuedLatest = latestQueuedInputBySource.get(sourceKey);
    if (inputQueueMode === "latest" && queuedLatest !== undefined) {
      const replacementDecision = acceptsQueuedInputReplacement(queuedLatest, payload, message);
      if (!replacementDecision.allowed) {
        rejectMessage(message, replacementDecision.code, replacementDecision.reason);
        diagnostics.rejectedInputs += 1;
        return;
      }
      queuedLatest.message = message;
      queuedLatest.payload = payload;
      diagnostics.coalescedInputs += 1;
      return;
    }

    const queuedForSource = queuedInputsBySource.get(sourceKey) ?? 0;
    if (queuedForSource >= maxQueuedInputsPerSource) {
      rejectMessage(message, "input-queue-full", "Input queue is full for this source.");
      diagnostics.rejectedInputs += 1;
      return;
    }

    const entry = { message, payload, sourceKey };
    inputQueue.push(entry);
    if (inputQueueMode === "latest") {
      latestQueuedInputBySource.set(sourceKey, entry);
    }
    queuedInputsBySource.set(sourceKey, queuedForSource + 1);
    refreshQueueDiagnostics();
  }

  function processAction(entry: QueuedAction<TAction>): void {
    const result = toDecision(
      options.handleAction?.({
        runtime: options.runtime,
        message: entry.message,
        payload: entry.payload,
        binding: options.binding.current()
      })
    );
    if (!result.allowed) {
      rejectMessage(entry.message, result.code, result.reason);
      diagnostics.rejectedActions += 1;
      return;
    }

    diagnostics.acceptedActions += 1;
  }

  function processQueuedActions(): void {
    const processedBySource = new Map<string, number>();
    const deferred: Array<QueuedAction<TAction>> = [];
    while (actionQueue.length > 0) {
      const entry = actionQueue.shift();
      if (!entry) {
        continue;
      }
      const processed = processedBySource.get(entry.sourceKey) ?? 0;
      if (processed >= maxActionsPerSourcePerTick) {
        deferred.push(entry);
        continue;
      }
      decrementQueued(queuedActionsBySource, entry.sourceKey);
      processAction(entry);
      processedBySource.set(entry.sourceKey, processed + 1);
    }
    actionQueue.push(...deferred);
    refreshQueueDiagnostics();
  }

  function processInput(entry: QueuedInput<TInput>): void {
    const sequenceDecision = acceptsInputSequence(entry.payload, entry.message);
    if (!sequenceDecision.allowed) {
      rejectMessage(entry.message, sequenceDecision.code, sequenceDecision.reason);
      diagnostics.rejectedInputs += 1;
      return;
    }

    const result = toDecision(
      options.handleInput?.({
        runtime: options.runtime,
        message: entry.message,
        payload: entry.payload,
        binding: options.binding.current()
      })
    );
    if (!result.allowed) {
      rejectMessage(entry.message, result.code, result.reason);
      diagnostics.rejectedInputs += 1;
      return;
    }

    diagnostics.acceptedInputs += 1;
  }

  function processQueuedInputs(): void {
    if (!Number.isFinite(maxInputsPerSourcePerTick)) {
      while (inputQueue.length > 0) {
        const entry = inputQueue.shift();
        if (entry) {
          releaseQueuedInput(entry);
          processInput(entry);
        }
      }
      refreshQueueDiagnostics();
      return;
    }

    const processedBySource = new Map<string, number>();
    const deferred: Array<QueuedInput<TInput>> = [];
    while (inputQueue.length > 0) {
      const entry = inputQueue.shift();
      if (!entry) {
        continue;
      }
      const sourceKey = entry.sourceKey;
      const processed = processedBySource.get(sourceKey) ?? 0;
      if (processed >= maxInputsPerSourcePerTick) {
        deferred.push(entry);
        continue;
      }
      releaseQueuedInput(entry);
      processInput(entry);
      processedBySource.set(sourceKey, processed + 1);
    }
    inputQueue.push(...deferred);
    refreshQueueDiagnostics();
  }

  function acceptsQueuedInputReplacement(
    queued: QueuedInput<TInput>,
    input: TInput,
    message: MultiplayerMessageEnvelope
  ): MultiplayerAuthorityDecision {
    const queuedSequence = options.inputSequence?.(queued.payload, queued.message);
    const nextSequence = options.inputSequence?.(input, message);
    if (
      queuedSequence !== undefined &&
      nextSequence !== undefined &&
      nextSequence <= queuedSequence
    ) {
      return {
        allowed: false,
        code: nextSequence === queuedSequence ? "duplicate-input" : "stale-input",
        reason: "Input sequence must be strictly increasing."
      };
    }
    return { allowed: true };
  }

  function releaseQueuedInput(entry: QueuedInput<TInput>): void {
    decrementQueuedInput(entry.sourceKey);
    if (latestQueuedInputBySource.get(entry.sourceKey) === entry) {
      latestQueuedInputBySource.delete(entry.sourceKey);
    }
  }

  function decrementQueuedInput(sourceKey: string): void {
    decrementQueued(queuedInputsBySource, sourceKey);
  }

  function refreshQueueDiagnostics(): void {
    diagnostics.queuedActions = actionQueue.length;
    diagnostics.maxQueuedActions = Math.max(diagnostics.maxQueuedActions, actionQueue.length);
    diagnostics.queuedInputs = inputQueue.length;
    diagnostics.maxQueuedInputs = Math.max(diagnostics.maxQueuedInputs, inputQueue.length);
  }

  function acceptsInputSequence(
    input: TInput,
    message: MultiplayerMessageEnvelope
  ): MultiplayerAuthorityDecision {
    const sequence = options.inputSequence?.(input, message);
    if (sequence === undefined) {
      return { allowed: true };
    }

    const key = options.inputSequenceKey?.(input, message) ?? message.sourcePeerId;
    const lastSequence = inputSequences.get(key) ?? Number.NEGATIVE_INFINITY;
    if (sequence <= lastSequence) {
      return {
        allowed: false,
        code: sequence === lastSequence ? "duplicate-input" : "stale-input",
        reason: "Input sequence must be strictly increasing."
      };
    }

    inputSequences.set(key, sequence);
    trackInputSequenceKey(message.sourcePeerId, key);
    return { allowed: true };
  }

  function trackInputSequenceKey(peerId: string, key: string): void {
    const previousPeerId = inputSequencePeerIdsByKey.get(key);
    if (previousPeerId !== undefined && previousPeerId !== peerId) {
      const previousKeys = inputSequenceKeysByPeerId.get(previousPeerId);
      previousKeys?.delete(key);
      if (previousKeys?.size === 0) {
        inputSequenceKeysByPeerId.delete(previousPeerId);
      }
    }

    const keys = inputSequenceKeysByPeerId.get(peerId) ?? new Set<string>();
    keys.add(key);
    inputSequenceKeysByPeerId.set(peerId, keys);
    inputSequencePeerIdsByKey.set(key, peerId);
  }

  function releasePeer(peerId: string): void {
    for (let index = actionQueue.length - 1; index >= 0; index -= 1) {
      const entry = actionQueue[index];
      if (entry?.message.sourcePeerId === peerId) {
        actionQueue.splice(index, 1);
        decrementQueued(queuedActionsBySource, entry.sourceKey);
      }
    }

    for (let index = inputQueue.length - 1; index >= 0; index -= 1) {
      const entry = inputQueue[index];
      if (entry?.message.sourcePeerId === peerId) {
        inputQueue.splice(index, 1);
        releaseQueuedInput(entry);
      }
    }

    for (const key of inputSequenceKeysByPeerId.get(peerId) ?? []) {
      if (inputSequencePeerIdsByKey.get(key) === peerId) {
        inputSequences.delete(key);
        inputSequencePeerIdsByKey.delete(key);
      }
    }
    inputSequenceKeysByPeerId.delete(peerId);
    refreshQueueDiagnostics();
  }

  function rejectMessage(message: MultiplayerMessageEnvelope, code: string, reason: string): void {
    const rejection = createRejection(code, reason, message);
    diagnostics.rejectedMessages += 1;
    diagnostics.lastRejected = rejection;
    options.onRejected?.(rejection);
  }

  async function broadcastSnapshot(): Promise<void> {
    if (options.runtime.phase() !== "in-session") {
      return;
    }

    const binding = options.binding.current();
    const context = {
      binding,
      tick: diagnostics.tick
    };
    const payload = options.captureSnapshot(context);
    try {
      if (options.publishSnapshot) {
        await options.publishSnapshot(payload, context);
      } else {
        await options.runtime.send({
          channel,
          kind: snapshotKind,
          tick: diagnostics.tick,
          ...(options.snapshotVersion === undefined
            ? binding.snapshotVersion === undefined
              ? {}
              : { schemaVersion: binding.snapshotVersion }
            : { schemaVersion: options.snapshotVersion }),
          payload
        });
      }
      diagnostics.sentSnapshots += 1;
      delete diagnostics.lastBroadcastError;
    } catch (error) {
      diagnostics.lastBroadcastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    tick(deltaMs = 0) {
      diagnostics.tick += 1;
      processQueuedActions();
      processQueuedInputs();
      const binding = options.binding.update({ tick: diagnostics.tick });
      options.tick?.({
        binding,
        tick: diagnostics.tick,
        deltaMs
      });
      void broadcastSnapshot();
    },
    broadcastSnapshot,
    releasePeer,
    diagnostics() {
      return cloneDiagnostics(diagnostics);
    },
    dispose() {
      unsubscribe();
      actionQueue.length = 0;
      queuedActionsBySource.clear();
      inputQueue.length = 0;
      queuedInputsBySource.clear();
      latestQueuedInputBySource.clear();
      inputSequences.clear();
      inputSequenceKeysByPeerId.clear();
      inputSequencePeerIdsByKey.clear();
      refreshQueueDiagnostics();
    }
  };
}

export function createMultiplayerLocalAuthorityLoop<TAction, TInput, TSnapshot>(
  options: MultiplayerLocalAuthorityLoopOptions<TAction, TInput, TSnapshot>
): MultiplayerLocalAuthorityLoop<TAction, TInput, TSnapshot> {
  const binding = createMultiplayerAuthorityBindingStore({
    ...options.binding,
    mode: "local",
    status: options.binding.status ?? "bound",
    authorityEndpoint: options.binding.authorityEndpoint ?? {
      kind: "local",
      id: "local"
    }
  });
  const inputSequences = new Map<string, number>();
  const diagnostics: MultiplayerAuthorityLoopDiagnostics = createDiagnostics();
  let latestSnapshot = captureAndApply();

  function dispatchAction(action: TAction): MultiplayerAuthorityDecision {
    diagnostics.receivedActions += 1;
    const result = toDecision(
      options.handleAction?.({
        payload: action,
        binding: binding.current(),
        tick: diagnostics.tick
      })
    );
    if (!result.allowed) {
      rejectLocal("action-rejected", result.reason);
      diagnostics.rejectedActions += 1;
      return result;
    }

    diagnostics.acceptedActions += 1;
    latestSnapshot = captureAndApply();
    return result;
  }

  function dispatchInput(input: TInput): MultiplayerAuthorityDecision {
    diagnostics.receivedInputs += 1;
    const sequenceDecision = acceptsLocalInputSequence(input);
    if (!sequenceDecision.allowed) {
      rejectLocal(sequenceDecision.code, sequenceDecision.reason);
      diagnostics.rejectedInputs += 1;
      return sequenceDecision;
    }

    const result = toDecision(
      options.handleInput?.({
        payload: input,
        binding: binding.current(),
        tick: diagnostics.tick
      })
    );
    if (!result.allowed) {
      rejectLocal(result.code, result.reason);
      diagnostics.rejectedInputs += 1;
      return result;
    }

    diagnostics.acceptedInputs += 1;
    latestSnapshot = captureAndApply();
    return result;
  }

  function acceptsLocalInputSequence(input: TInput): MultiplayerAuthorityDecision {
    const sequence = options.inputSequence?.(input);
    if (sequence === undefined) {
      return { allowed: true };
    }

    const key = options.inputSequenceKey?.(input) ?? "local";
    const lastSequence = inputSequences.get(key) ?? Number.NEGATIVE_INFINITY;
    if (sequence <= lastSequence) {
      return {
        allowed: false,
        code: sequence === lastSequence ? "duplicate-input" : "stale-input",
        reason: "Input sequence must be strictly increasing."
      };
    }

    inputSequences.set(key, sequence);
    return { allowed: true };
  }

  function captureAndApply(): TSnapshot {
    const context = {
      binding: binding.current(),
      tick: diagnostics.tick
    };
    const snapshot = options.captureSnapshot(context);
    options.applySnapshot?.(snapshot, context);
    return snapshot;
  }

  function rejectLocal(code: string, reason: string): void {
    const rejection = createRejection(code, reason);
    diagnostics.rejectedMessages += 1;
    diagnostics.lastRejected = rejection;
    options.onRejected?.(rejection);
  }

  return {
    binding() {
      return binding.current();
    },
    dispatchAction,
    dispatchInput,
    tick(deltaMs = 0) {
      diagnostics.tick += 1;
      const current = binding.update({ tick: diagnostics.tick });
      options.tick?.({
        binding: current,
        tick: diagnostics.tick,
        deltaMs
      });
      latestSnapshot = captureAndApply();
      diagnostics.sentSnapshots += 1;
    },
    snapshot() {
      return latestSnapshot;
    },
    diagnostics() {
      return cloneDiagnostics(diagnostics);
    }
  };
}

function normalizeMaxInputsPerSourcePerTick(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value)
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.floor(value));
}

function normalizePerSourceLimit(value: number | undefined, defaultValue: number): number {
  return value === undefined || !Number.isFinite(value)
    ? defaultValue
    : Math.max(1, Math.floor(value));
}

function normalizeQueueLimit(
  value: number | undefined,
  perTickLimit: number,
  defaultValue: number
): number {
  if (value !== undefined && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  return Number.isFinite(perTickLimit) ? Math.max(perTickLimit, defaultValue) : defaultValue;
}

function decrementQueued(counts: Map<string, number>, sourceKey: string): void {
  const remaining = (counts.get(sourceKey) ?? 1) - 1;
  if (remaining <= 0) {
    counts.delete(sourceKey);
  } else {
    counts.set(sourceKey, remaining);
  }
}

function normalizeMaxQueuedInputsPerSource(
  value: number | undefined,
  maxInputsPerSourcePerTick: number
): number {
  if (value !== undefined && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  return Number.isFinite(maxInputsPerSourcePerTick)
    ? maxInputsPerSourcePerTick * 4
    : Number.POSITIVE_INFINITY;
}

function acceptsClientMessage(
  binding: MultiplayerAuthorityBinding,
  message: MultiplayerMessageEnvelope
): MultiplayerAuthorityDecision {
  if (binding.status !== "bound" && binding.status !== "resyncing") {
    return {
      allowed: false,
      code: "authority-not-bound",
      reason: `Authority binding is not ready: ${binding.status}.`
    };
  }

  if (message.sessionId !== binding.sessionId) {
    return {
      allowed: false,
      code: "session-mismatch",
      reason: `Authority message session mismatch: ${message.sessionId}.`
    };
  }

  if (binding.authorityPeerId && message.sourcePeerId === binding.authorityPeerId) {
    return {
      allowed: false,
      code: "authority-echo",
      reason: "Authority loop ignores its own action/input messages."
    };
  }

  return { allowed: true };
}

function toDecision(
  decision: MultiplayerAuthorityDecision | void | undefined
): MultiplayerAuthorityDecision {
  return decision ?? { allowed: true };
}

function createDiagnostics(): MultiplayerAuthorityLoopDiagnostics {
  return {
    tick: 0,
    receivedActions: 0,
    acceptedActions: 0,
    rejectedActions: 0,
    queuedActions: 0,
    maxQueuedActions: 0,
    receivedInputs: 0,
    acceptedInputs: 0,
    rejectedInputs: 0,
    coalescedInputs: 0,
    queuedInputs: 0,
    maxQueuedInputs: 0,
    sentSnapshots: 0,
    rejectedMessages: 0
  };
}

function cloneDiagnostics(
  diagnostics: MultiplayerAuthorityLoopDiagnostics
): MultiplayerAuthorityLoopDiagnostics {
  return {
    tick: diagnostics.tick,
    receivedActions: diagnostics.receivedActions,
    acceptedActions: diagnostics.acceptedActions,
    rejectedActions: diagnostics.rejectedActions,
    queuedActions: diagnostics.queuedActions,
    maxQueuedActions: diagnostics.maxQueuedActions,
    receivedInputs: diagnostics.receivedInputs,
    acceptedInputs: diagnostics.acceptedInputs,
    rejectedInputs: diagnostics.rejectedInputs,
    coalescedInputs: diagnostics.coalescedInputs,
    queuedInputs: diagnostics.queuedInputs,
    maxQueuedInputs: diagnostics.maxQueuedInputs,
    sentSnapshots: diagnostics.sentSnapshots,
    rejectedMessages: diagnostics.rejectedMessages,
    ...(diagnostics.lastRejected === undefined
      ? {}
      : { lastRejected: { ...diagnostics.lastRejected } }),
    ...(diagnostics.lastBroadcastError === undefined
      ? {}
      : { lastBroadcastError: diagnostics.lastBroadcastError })
  };
}

function createRejection(
  code: string,
  reason: string,
  message?: MultiplayerMessageEnvelope
): MultiplayerAuthorityRejectedPayload {
  return {
    code,
    reason,
    ...(message === undefined
      ? {}
      : {
          messageId: message.id,
          sourcePeerId: message.sourcePeerId,
          kind: message.kind
        })
  };
}
