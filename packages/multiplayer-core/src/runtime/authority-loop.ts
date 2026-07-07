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
  handleAction?(
    ctx: MultiplayerAuthorityMessageContext<TAction>
  ): MultiplayerAuthorityDecision | void;
  handleInput?(
    ctx: MultiplayerAuthorityMessageContext<TInput>
  ): MultiplayerAuthorityDecision | void;
  tick?(ctx: MultiplayerAuthorityTickContext): void;
  captureSnapshot(ctx: MultiplayerAuthoritySnapshotContext): TSnapshot;
  onRejected?(rejection: MultiplayerAuthorityRejectedPayload): void;
};

export type MultiplayerAuthorityLoopDiagnostics = {
  tick: number;
  receivedActions: number;
  acceptedActions: number;
  rejectedActions: number;
  receivedInputs: number;
  acceptedInputs: number;
  rejectedInputs: number;
  sentSnapshots: number;
  rejectedMessages: number;
  lastRejected?: MultiplayerAuthorityRejectedPayload;
  lastBroadcastError?: string;
};

export type MultiplayerAuthorityHostLoop = {
  tick(deltaMs?: number): void;
  broadcastSnapshot(): Promise<void>;
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
  const actionQueue: Array<QueuedPayload<TAction>> = [];
  const inputQueue: Array<QueuedPayload<TInput>> = [];
  const inputSequences = new Map<string, number>();
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

    actionQueue.push({ message, payload });
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

    inputQueue.push({ message, payload });
  }

  function processAction(entry: QueuedPayload<TAction>): void {
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

  function processInput(entry: QueuedPayload<TInput>): void {
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
    return { allowed: true };
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
    const payload = options.captureSnapshot({
      binding,
      tick: diagnostics.tick
    });
    try {
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
      diagnostics.sentSnapshots += 1;
      delete diagnostics.lastBroadcastError;
    } catch (error) {
      diagnostics.lastBroadcastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    tick(deltaMs = 0) {
      diagnostics.tick += 1;
      while (actionQueue.length > 0) {
        const entry = actionQueue.shift();
        if (entry) {
          processAction(entry);
        }
      }
      while (inputQueue.length > 0) {
        const entry = inputQueue.shift();
        if (entry) {
          processInput(entry);
        }
      }
      const binding = options.binding.update({ tick: diagnostics.tick });
      options.tick?.({
        binding,
        tick: diagnostics.tick,
        deltaMs
      });
      void broadcastSnapshot();
    },
    broadcastSnapshot,
    diagnostics() {
      return cloneDiagnostics(diagnostics);
    },
    dispose() {
      unsubscribe();
      actionQueue.length = 0;
      inputQueue.length = 0;
      inputSequences.clear();
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
    receivedInputs: 0,
    acceptedInputs: 0,
    rejectedInputs: 0,
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
    receivedInputs: diagnostics.receivedInputs,
    acceptedInputs: diagnostics.acceptedInputs,
    rejectedInputs: diagnostics.rejectedInputs,
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
