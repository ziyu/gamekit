import {
  MULTIPLAYER_PATCH_KIND,
  MULTIPLAYER_SNAPSHOT_KIND,
  type MultiplayerAuthorityApplyContext,
  type MultiplayerAuthorityBindingStore,
  type MultiplayerAuthorityRejectedPayload
} from "./authority-types";
import type { MultiplayerMessageEnvelope, MultiplayerRuntime } from "./types";

export type MultiplayerAuthorityReceiverOptions<TSnapshot, TPatch = unknown> = {
  runtime: MultiplayerRuntime;
  binding: MultiplayerAuthorityBindingStore;
  snapshotKind?: string;
  patchKind?: string;
  clock?: () => number;
  readSnapshot?(payload: unknown, message: MultiplayerMessageEnvelope): TSnapshot | undefined;
  readPatch?(payload: unknown, message: MultiplayerMessageEnvelope): TPatch | undefined;
  applySnapshot(snapshot: TSnapshot, ctx: MultiplayerAuthorityApplyContext): void;
  applyPatch?(patch: TPatch, ctx: MultiplayerAuthorityApplyContext): void;
  onRejected?(rejection: MultiplayerAuthorityRejectedPayload): void;
};

export type MultiplayerAuthorityReceiverDiagnostics = {
  receivedSnapshots: number;
  appliedSnapshots: number;
  receivedPatches: number;
  appliedPatches: number;
  rejectedMessages: number;
  lastAppliedTick?: number;
  lastSnapshotAgeMs?: number;
  lastRejected?: MultiplayerAuthorityRejectedPayload;
};

export type MultiplayerAuthorityReceiver = {
  diagnostics(): MultiplayerAuthorityReceiverDiagnostics;
  dispose(): void;
};

export function createMultiplayerAuthorityReceiver<TSnapshot, TPatch = unknown>(
  options: MultiplayerAuthorityReceiverOptions<TSnapshot, TPatch>
): MultiplayerAuthorityReceiver {
  const snapshotKind = options.snapshotKind ?? MULTIPLAYER_SNAPSHOT_KIND;
  const patchKind = options.patchKind ?? MULTIPLAYER_PATCH_KIND;
  const clock = options.clock ?? (() => Date.now());
  const diagnostics: MultiplayerAuthorityReceiverDiagnostics = {
    receivedSnapshots: 0,
    appliedSnapshots: 0,
    receivedPatches: 0,
    appliedPatches: 0,
    rejectedMessages: 0
  };

  const unsubscribe = options.runtime.subscribe((message) => {
    if (message.kind === snapshotKind) {
      diagnostics.receivedSnapshots += 1;
      handleSnapshot(message);
      return;
    }

    if (message.kind === patchKind) {
      diagnostics.receivedPatches += 1;
      handlePatch(message);
    }
  });

  function handleSnapshot(message: MultiplayerMessageEnvelope): void {
    const decision = options.binding.acceptsMessage(message);
    if (!decision.allowed) {
      rejectMessage(message, decision.code, decision.reason);
      return;
    }

    const snapshot = options.readSnapshot
      ? options.readSnapshot(message.payload, message)
      : (message.payload as TSnapshot);
    if (snapshot === undefined) {
      rejectMessage(message, "invalid-snapshot", "Snapshot payload could not be decoded.");
      return;
    }

    const binding = options.binding.current();
    options.applySnapshot(snapshot, {
      binding,
      message,
      sourcePeerId: message.sourcePeerId,
      ...(message.tick === undefined ? {} : { tick: message.tick })
    });
    diagnostics.appliedSnapshots += 1;
    diagnostics.lastSnapshotAgeMs = Math.max(0, clock() - message.timestamp);
    if (message.tick !== undefined) {
      diagnostics.lastAppliedTick = message.tick;
      options.binding.update({ tick: message.tick });
    }
  }

  function handlePatch(message: MultiplayerMessageEnvelope): void {
    const decision = options.binding.acceptsMessage(message);
    if (!decision.allowed) {
      rejectMessage(message, decision.code, decision.reason);
      return;
    }

    if (!options.readPatch || !options.applyPatch) {
      rejectMessage(message, "patch-not-supported", "Patch receiver is not configured.");
      return;
    }

    const patch = options.readPatch(message.payload, message);
    if (patch === undefined) {
      rejectMessage(message, "invalid-patch", "Patch payload could not be decoded.");
      return;
    }

    const binding = options.binding.current();
    options.applyPatch(patch, {
      binding,
      message,
      sourcePeerId: message.sourcePeerId,
      ...(message.tick === undefined ? {} : { tick: message.tick })
    });
    diagnostics.appliedPatches += 1;
    if (message.tick !== undefined) {
      diagnostics.lastAppliedTick = message.tick;
      options.binding.update({ tick: message.tick });
    }
  }

  function rejectMessage(message: MultiplayerMessageEnvelope, code: string, reason: string): void {
    const rejection: MultiplayerAuthorityRejectedPayload = {
      code,
      reason,
      messageId: message.id,
      sourcePeerId: message.sourcePeerId,
      kind: message.kind
    };
    diagnostics.rejectedMessages += 1;
    diagnostics.lastRejected = rejection;
    options.onRejected?.(rejection);
  }

  return {
    diagnostics() {
      return cloneDiagnostics(diagnostics);
    },
    dispose() {
      unsubscribe();
    }
  };
}

function cloneDiagnostics(
  diagnostics: MultiplayerAuthorityReceiverDiagnostics
): MultiplayerAuthorityReceiverDiagnostics {
  return {
    receivedSnapshots: diagnostics.receivedSnapshots,
    appliedSnapshots: diagnostics.appliedSnapshots,
    receivedPatches: diagnostics.receivedPatches,
    appliedPatches: diagnostics.appliedPatches,
    rejectedMessages: diagnostics.rejectedMessages,
    ...(diagnostics.lastAppliedTick === undefined
      ? {}
      : { lastAppliedTick: diagnostics.lastAppliedTick }),
    ...(diagnostics.lastSnapshotAgeMs === undefined
      ? {}
      : { lastSnapshotAgeMs: diagnostics.lastSnapshotAgeMs }),
    ...(diagnostics.lastRejected === undefined
      ? {}
      : { lastRejected: { ...diagnostics.lastRejected } })
  };
}
