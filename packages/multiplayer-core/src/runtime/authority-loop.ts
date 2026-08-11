import { createMultiplayerAuthorityBindingStore } from "./authority-binding";
import { createBoundedQueue } from "./bounded-queue";
import { createMultiplayerError, multiplayerErrorCodes } from "./errors";
import {
  createMultiplayerFixedStepInputInbox,
  type MultiplayerFixedStepInputGapPolicy,
  type MultiplayerFixedStepInputGeneration,
  type MultiplayerFixedStepInputInbox,
  type MultiplayerFixedStepInputInboxDiagnostics
} from "./fixed-step-input";
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

export type MultiplayerAuthorityInputDeliveryOptions<TInput> =
  | { mode: "single" }
  | {
      mode: "redundant-bundle";
      maxSources?: number | undefined;
      maxBufferedFramesPerSource?: number | undefined;
      maxGapTicks?: number | undefined;
      gapPolicy?: MultiplayerFixedStepInputGapPolicy | undefined;
      cloneInput?(input: TInput): TInput;
      neutralInput?(context: {
        sourceId: string;
        generation: MultiplayerFixedStepInputGeneration;
        sequence: number;
      }): TInput;
      generation?(
        message: MultiplayerMessageEnvelope,
        binding: MultiplayerAuthorityBinding
      ): MultiplayerFixedStepInputGeneration;
    };

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
  maxQueuedActions?: number;
  inputQueueMode?: MultiplayerAuthorityInputQueueMode;
  inputDelivery?: MultiplayerAuthorityInputDeliveryOptions<TInput> | undefined;
  maxInputsPerSourcePerTick?: number;
  maxQueuedInputsPerSource?: number;
  maxQueuedInputs?: number;
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
  actionQueueCapacity: number;
  overflowedActions: number;
  receivedInputs: number;
  acceptedInputs: number;
  rejectedInputs: number;
  coalescedInputs: number;
  queuedInputs: number;
  maxQueuedInputs: number;
  inputQueueCapacity: number;
  overflowedInputs: number;
  committedTicks: number;
  activeTick?: number;
  sentSnapshots: number;
  rejectedMessages: number;
  lastRejected?: MultiplayerAuthorityRejectedPayload;
  lastBroadcastError?: string;
  fixedStepInput?: MultiplayerFixedStepInputInboxDiagnostics | undefined;
};

export type MultiplayerAuthorityHostLoop = {
  beginTick(deltaMs?: number): MultiplayerAuthorityTickContext;
  commitTick(): Promise<void>;
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
  const maxQueuedActions = normalizeGlobalQueueLimit(options.maxQueuedActions, 1024);
  const inputQueueMode = options.inputQueueMode ?? "fifo";
  const maxInputsPerSourcePerTick = normalizeMaxInputsPerSourcePerTick(
    options.maxInputsPerSourcePerTick
  );
  const maxQueuedInputsPerSource = normalizeMaxQueuedInputsPerSource(
    options.maxQueuedInputsPerSource,
    maxInputsPerSourcePerTick
  );
  const maxQueuedInputs = normalizeGlobalQueueLimit(options.maxQueuedInputs, 1024);
  const actionQueue = createBoundedQueue<QueuedAction<TAction>>(maxQueuedActions);
  const queuedActionsBySource = new Map<string, number>();
  const inputQueue = createBoundedQueue<QueuedInput<TInput>>(maxQueuedInputs);
  const queuedInputsBySource = new Map<string, number>();
  const latestQueuedInputBySource = new Map<string, QueuedInput<TInput>>();
  const inputSequences = new Map<string, number>();
  const inputSequenceKeysByPeerId = new Map<string, Set<string>>();
  const inputSequencePeerIdsByKey = new Map<string, string>();
  const diagnostics: MultiplayerAuthorityLoopDiagnostics = createDiagnostics();
  diagnostics.actionQueueCapacity = actionQueue.capacity;
  diagnostics.inputQueueCapacity = inputQueue.capacity;
  let activeFrame: MultiplayerAuthorityTickContext | undefined;
  let publishChain: Promise<void> = Promise.resolve();
  let disposed = false;
  if (options.inputDelivery?.mode === "redundant-bundle" && inputQueueMode !== "fifo") {
    throw new Error("Redundant fixed-step input delivery requires fifo authority input order.");
  }
  const bundledInputInbox = createBundledInputInbox(
    options.inputDelivery,
    maxQueuedInputs,
    maxQueuedInputsPerSource
  );
  const bundledInputSources = new Map<
    string,
    { message: MultiplayerMessageEnvelope; generation: MultiplayerFixedStepInputGeneration }
  >();

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
      diagnostics.overflowedActions += 1;
      return;
    }

    if (!actionQueue.enqueue({ message, payload, sourceKey })) {
      rejectMessage(message, "action-queue-full", "Action queue is full for this room.");
      diagnostics.rejectedActions += 1;
      diagnostics.overflowedActions += 1;
      return;
    }
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

    if (bundledInputInbox !== undefined && options.inputDelivery?.mode === "redundant-bundle") {
      const generation =
        options.inputDelivery.generation?.(message, options.binding.current()) ??
        options.binding.current().sessionId;
      const result = bundledInputInbox.ingest({
        sourceId: message.sourcePeerId,
        generation,
        bundle: message.payload,
        decode(payload) {
          return options.readInput ? options.readInput(payload, message) : (payload as TInput);
        }
      });
      if (result.status !== "accepted" || result.rejected > 0) {
        rejectMessage(
          message,
          result.status === "source-capacity" ? "input-source-capacity" : "invalid-input-bundle",
          "Fixed-step input bundle could not be accepted."
        );
        diagnostics.rejectedInputs += 1;
      }
      if (result.status === "accepted") {
        bundledInputSources.set(message.sourcePeerId, { message, generation });
      }
      refreshQueueDiagnostics();
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

    enqueueDecodedInput(message, payload);
  }

  function enqueueDecodedInput(message: MultiplayerMessageEnvelope, payload: TInput): void {
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
      diagnostics.overflowedInputs += 1;
      return;
    }

    const entry = { message, payload, sourceKey };
    if (!inputQueue.enqueue(entry)) {
      rejectMessage(message, "input-queue-full", "Input queue is full for this room.");
      diagnostics.rejectedInputs += 1;
      diagnostics.overflowedInputs += 1;
      return;
    }
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
    const pending = actionQueue.length;
    for (let index = 0; index < pending; index += 1) {
      const entry = actionQueue.dequeue();
      if (!entry) {
        continue;
      }
      const processed = processedBySource.get(entry.sourceKey) ?? 0;
      if (processed >= maxActionsPerSourcePerTick) {
        actionQueue.enqueue(entry);
        continue;
      }
      decrementQueued(queuedActionsBySource, entry.sourceKey);
      processAction(entry);
      processedBySource.set(entry.sourceKey, processed + 1);
    }
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
    processBundledInputs();
    if (!Number.isFinite(maxInputsPerSourcePerTick)) {
      while (inputQueue.length > 0) {
        const entry = inputQueue.dequeue();
        if (entry) {
          releaseQueuedInput(entry);
          processInput(entry);
        }
      }
      refreshQueueDiagnostics();
      return;
    }

    const processedBySource = new Map<string, number>();
    const pending = inputQueue.length;
    for (let index = 0; index < pending; index += 1) {
      const entry = inputQueue.dequeue();
      if (!entry) {
        continue;
      }
      const sourceKey = entry.sourceKey;
      const processed = processedBySource.get(sourceKey) ?? 0;
      if (processed >= maxInputsPerSourcePerTick) {
        inputQueue.enqueue(entry);
        continue;
      }
      releaseQueuedInput(entry);
      processInput(entry);
      processedBySource.set(sourceKey, processed + 1);
    }
    refreshQueueDiagnostics();
  }

  function processBundledInputs(): void {
    if (bundledInputInbox === undefined) {
      return;
    }
    const perSourceLimit = Number.isFinite(maxInputsPerSourcePerTick)
      ? maxInputsPerSourcePerTick
      : maxQueuedInputsPerSource;
    for (const [sourceId, source] of bundledInputSources) {
      for (let index = 0; index < perSourceLimit; index += 1) {
        const result = bundledInputInbox.consume({ sourceId, generation: source.generation });
        if (result.status !== "input" && result.status !== "gap-filled") {
          break;
        }
        const message: MultiplayerMessageEnvelope = {
          ...source.message,
          payload: result.frame.payload,
          ...(result.frame.tick === undefined ? {} : { tick: result.frame.tick }),
          ...(result.frame.timestamp === undefined ? {} : { timestamp: result.frame.timestamp })
        };
        enqueueDecodedInput(message, result.frame.payload);
      }
    }
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
    const fixedStepInput = bundledInputInbox?.diagnostics();
    diagnostics.queuedInputs = inputQueue.length + (fixedStepInput?.queuedFrames ?? 0);
    diagnostics.maxQueuedInputs = Math.max(diagnostics.maxQueuedInputs, inputQueue.length);
    if (fixedStepInput === undefined) {
      delete diagnostics.fixedStepInput;
    } else {
      diagnostics.fixedStepInput = fixedStepInput;
      diagnostics.maxQueuedInputs = Math.max(
        diagnostics.maxQueuedInputs,
        inputQueue.length + fixedStepInput.queuedFrames
      );
    }
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
    actionQueue.removeWhere(
      (entry) => entry.message.sourcePeerId === peerId,
      (entry) => {
        decrementQueued(queuedActionsBySource, entry.sourceKey);
      }
    );

    inputQueue.removeWhere(
      (entry) => entry.message.sourcePeerId === peerId,
      (entry) => {
        releaseQueuedInput(entry);
      }
    );

    for (const key of inputSequenceKeysByPeerId.get(peerId) ?? []) {
      if (inputSequencePeerIdsByKey.get(key) === peerId) {
        inputSequences.delete(key);
        inputSequencePeerIdsByKey.delete(key);
      }
    }
    inputSequenceKeysByPeerId.delete(peerId);
    bundledInputInbox?.release(peerId);
    bundledInputSources.delete(peerId);
    refreshQueueDiagnostics();
  }

  function rejectMessage(message: MultiplayerMessageEnvelope, code: string, reason: string): void {
    const rejection = createRejection(code, reason, message);
    diagnostics.rejectedMessages += 1;
    diagnostics.lastRejected = rejection;
    options.onRejected?.(rejection);
  }

  function publishCapturedSnapshot(
    payload: TSnapshot,
    context: MultiplayerAuthoritySnapshotContext
  ): Promise<void> {
    const publish = async () => {
      if (disposed || options.runtime.phase() !== "in-session") {
        return;
      }

      try {
        if (options.publishSnapshot) {
          await options.publishSnapshot(payload, context);
        } else {
          await options.runtime.send({
            channel,
            kind: snapshotKind,
            tick: context.tick,
            ...(options.snapshotVersion === undefined
              ? context.binding.snapshotVersion === undefined
                ? {}
                : { schemaVersion: context.binding.snapshotVersion }
              : { schemaVersion: options.snapshotVersion }),
            payload
          });
        }
        diagnostics.sentSnapshots += 1;
        delete diagnostics.lastBroadcastError;
      } catch (error) {
        diagnostics.lastBroadcastError = error instanceof Error ? error.message : String(error);
      }
    };

    publishChain = publishChain.then(publish, publish);
    return publishChain;
  }

  function captureSnapshot(context: MultiplayerAuthoritySnapshotContext): TSnapshot {
    try {
      return options.captureSnapshot(context);
    } catch (error) {
      diagnostics.lastBroadcastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  function broadcastSnapshot(): Promise<void> {
    assertNotDisposed();
    if (options.runtime.phase() !== "in-session") {
      return Promise.resolve();
    }

    const binding = options.binding.current();
    const context = {
      binding,
      tick: diagnostics.tick
    };
    return publishCapturedSnapshot(captureSnapshot(context), context);
  }

  function assertNotDisposed(): void {
    if (disposed) {
      throw createMultiplayerError(
        multiplayerErrorCodes.disposed,
        "Cannot advance a disposed multiplayer authority loop."
      );
    }
  }

  function beginTick(deltaMs = 0): MultiplayerAuthorityTickContext {
    assertNotDisposed();
    if (activeFrame !== undefined) {
      throw createMultiplayerError(
        multiplayerErrorCodes.authorityFrameState,
        "Cannot begin an authority tick before committing the active tick.",
        { activeTick: activeFrame.tick }
      );
    }

    diagnostics.tick += 1;
    processQueuedActions();
    processQueuedInputs();
    const binding = options.binding.update({ tick: diagnostics.tick });
    const frame = {
      binding,
      tick: diagnostics.tick,
      deltaMs
    };
    activeFrame = frame;
    diagnostics.activeTick = frame.tick;
    try {
      options.tick?.(frame);
    } catch (error) {
      activeFrame = undefined;
      delete diagnostics.activeTick;
      throw error;
    }
    return { ...frame, binding: { ...frame.binding } };
  }

  function commitTick(): Promise<void> {
    assertNotDisposed();
    if (activeFrame === undefined) {
      throw createMultiplayerError(
        multiplayerErrorCodes.authorityFrameState,
        "Cannot commit an authority tick before beginning one."
      );
    }

    const frame = activeFrame;
    activeFrame = undefined;
    delete diagnostics.activeTick;
    const context = {
      binding: options.binding.current(),
      tick: frame.tick
    };
    let payload: TSnapshot;
    try {
      payload = captureSnapshot(context);
    } catch (error) {
      return Promise.reject(error);
    }
    diagnostics.committedTicks += 1;
    return publishCapturedSnapshot(payload, context);
  }

  return {
    beginTick,
    commitTick,
    tick(deltaMs = 0) {
      if (disposed) {
        return;
      }
      beginTick(deltaMs);
      void commitTick().catch(() => undefined);
    },
    broadcastSnapshot,
    releasePeer,
    diagnostics() {
      return cloneDiagnostics(diagnostics);
    },
    dispose() {
      disposed = true;
      unsubscribe();
      activeFrame = undefined;
      delete diagnostics.activeTick;
      actionQueue.clear();
      queuedActionsBySource.clear();
      inputQueue.clear();
      queuedInputsBySource.clear();
      latestQueuedInputBySource.clear();
      inputSequences.clear();
      inputSequenceKeysByPeerId.clear();
      inputSequencePeerIdsByKey.clear();
      bundledInputInbox?.dispose();
      bundledInputSources.clear();
      refreshQueueDiagnostics();
    }
  };
}

function createBundledInputInbox<TInput>(
  delivery: MultiplayerAuthorityInputDeliveryOptions<TInput> | undefined,
  maxQueuedInputs: number,
  maxQueuedInputsPerSource: number
): MultiplayerFixedStepInputInbox<TInput> | undefined {
  if (delivery?.mode !== "redundant-bundle") {
    return undefined;
  }
  const maxBufferedFramesPerSource = Math.min(
    delivery.maxBufferedFramesPerSource ?? maxQueuedInputsPerSource,
    maxQueuedInputs
  );
  const maxSources = Math.min(
    delivery.maxSources ?? Math.max(1, Math.floor(maxQueuedInputs / maxBufferedFramesPerSource)),
    maxQueuedInputs
  );
  return createMultiplayerFixedStepInputInbox({
    maxSources,
    maxBufferedFramesPerSource,
    ...(delivery.maxGapTicks === undefined ? {} : { maxGapTicks: delivery.maxGapTicks }),
    ...(delivery.gapPolicy === undefined ? {} : { gapPolicy: delivery.gapPolicy }),
    ...(delivery.cloneInput === undefined ? {} : { cloneInput: delivery.cloneInput }),
    ...(delivery.neutralInput === undefined ? {} : { neutralInput: delivery.neutralInput })
  });
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
      diagnostics.committedTicks += 1;
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
  return Number.isFinite(maxInputsPerSourcePerTick) ? maxInputsPerSourcePerTick * 4 : 32;
}

function normalizeGlobalQueueLimit(value: number | undefined, defaultValue: number): number {
  return value === undefined || !Number.isFinite(value)
    ? defaultValue
    : Math.max(1, Math.floor(value));
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
    actionQueueCapacity: 0,
    overflowedActions: 0,
    receivedInputs: 0,
    acceptedInputs: 0,
    rejectedInputs: 0,
    coalescedInputs: 0,
    queuedInputs: 0,
    maxQueuedInputs: 0,
    inputQueueCapacity: 0,
    overflowedInputs: 0,
    committedTicks: 0,
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
    actionQueueCapacity: diagnostics.actionQueueCapacity,
    overflowedActions: diagnostics.overflowedActions,
    receivedInputs: diagnostics.receivedInputs,
    acceptedInputs: diagnostics.acceptedInputs,
    rejectedInputs: diagnostics.rejectedInputs,
    coalescedInputs: diagnostics.coalescedInputs,
    queuedInputs: diagnostics.queuedInputs,
    maxQueuedInputs: diagnostics.maxQueuedInputs,
    inputQueueCapacity: diagnostics.inputQueueCapacity,
    overflowedInputs: diagnostics.overflowedInputs,
    committedTicks: diagnostics.committedTicks,
    ...(diagnostics.activeTick === undefined ? {} : { activeTick: diagnostics.activeTick }),
    sentSnapshots: diagnostics.sentSnapshots,
    rejectedMessages: diagnostics.rejectedMessages,
    ...(diagnostics.lastRejected === undefined
      ? {}
      : { lastRejected: { ...diagnostics.lastRejected } }),
    ...(diagnostics.lastBroadcastError === undefined
      ? {}
      : { lastBroadcastError: diagnostics.lastBroadcastError }),
    ...(diagnostics.fixedStepInput === undefined
      ? {}
      : { fixedStepInput: { ...diagnostics.fixedStepInput } })
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
