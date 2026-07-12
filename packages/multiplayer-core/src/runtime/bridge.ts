import type { EventBus } from "@gamekit/event-bus";
import type { GameModule } from "@gamekit/core";
import {
  createSnapshotPresentationProjector,
  createSnapshotPlayback,
  type PresentedSnapshotTracks,
  type SnapshotBufferEntry,
  type SnapshotPlayback,
  type SnapshotPlaybackOptions,
  type SnapshotPlaybackSample,
  type SnapshotPresentationTrack
} from "./presentation";
import type {
  MultiplayerAuthorityDecision,
  MultiplayerMessageEnvelope,
  MultiplayerRuntime
} from "./types";
import { createBoundedQueue } from "./bounded-queue";

export type MultiplayerBridgeInstallContext = {
  eventBus: EventBus;
  systems: {
    register(system: MultiplayerBridgeSystem): void;
  };
};

export type MultiplayerBridgeSystemContext = {
  delta?: number;
  elapsed?: number;
  tick?: number;
};

export type MultiplayerBridgeSystem = {
  id: string;
  update(ctx?: MultiplayerBridgeSystemContext): void;
};

export type MultiplayerCommandContext<TInstallContext extends MultiplayerBridgeInstallContext> = {
  installContext: TInstallContext;
  runtime: MultiplayerRuntime;
  message: MultiplayerMessageEnvelope;
};

export type MultiplayerAuthorityPolicy<TInstallContext extends MultiplayerBridgeInstallContext> = (
  ctx: MultiplayerCommandContext<TInstallContext>
) => MultiplayerAuthorityDecision;

export type MultiplayerCommandHandler<TInstallContext extends MultiplayerBridgeInstallContext> = (
  ctx: MultiplayerCommandContext<TInstallContext>
) => void;

export type MultiplayerCommandQueueOverflowPolicy = "reject-newest" | "drop-oldest";

export type MultiplayerCommandQueueDiagnostics = {
  capacity: number;
  queued: number;
  maxQueued: number;
  received: number;
  handled: number;
  rejected: number;
  overflowed: number;
  expired: number;
  lastCode?: string;
  lastMessageId?: string;
};

export type MultiplayerCommandQueueOptions = {
  capacity?: number;
  maxPerTick?: number;
  maxAgeMs?: number;
  overflowPolicy?: MultiplayerCommandQueueOverflowPolicy;
  clock?: () => number;
  onDiagnostics?(diagnostics: MultiplayerCommandQueueDiagnostics): void;
};

export type MultiplayerPresentationReadContext<
  TInstallContext extends MultiplayerBridgeInstallContext
> = {
  installContext: TInstallContext;
  runtime: MultiplayerRuntime;
  frame: MultiplayerBridgeSystemContext;
};

export type MultiplayerPresentationApplyContext<
  TSnapshot,
  TInstallContext extends MultiplayerBridgeInstallContext
> = MultiplayerPresentationReadContext<TInstallContext> & {
  playback: SnapshotPlayback<TSnapshot>;
  sample: SnapshotPlaybackSample<TSnapshot>;
  presented: PresentedSnapshotTracks;
  snapshot: TSnapshot;
};

export type MultiplayerPresentationBridgeOptions<
  TSnapshot = any,
  TInstallContext extends MultiplayerBridgeInstallContext = MultiplayerBridgeInstallContext
> = SnapshotPlaybackOptions<TSnapshot> & {
  id?: string;
  tracks?: Iterable<SnapshotPresentationTrack<TSnapshot>>;
  readSnapshot(
    ctx: MultiplayerPresentationReadContext<TInstallContext>
  ): SnapshotBufferEntry<TSnapshot> | undefined;
  applySample(ctx: MultiplayerPresentationApplyContext<TSnapshot, TInstallContext>): void;
};

export type MultiplayerModuleOptions<
  TInstallContext extends MultiplayerBridgeInstallContext,
  TSnapshot = any
> = {
  id?: string;
  runtime: MultiplayerRuntime;
  commandKinds?: string[];
  commandQueue?: MultiplayerCommandQueueOptions;
  authority?: MultiplayerAuthorityPolicy<TInstallContext>;
  handleCommand?: MultiplayerCommandHandler<TInstallContext>;
  presentation?: MultiplayerPresentationBridgeOptions<TSnapshot, TInstallContext>;
};

/** @deprecated Use MultiplayerModuleOptions. */
export type CreateMultiplayerBridgeModuleOptions<
  TInstallContext extends MultiplayerBridgeInstallContext,
  TSnapshot = any
> = MultiplayerModuleOptions<TInstallContext, TSnapshot>;

export function createMultiplayerModule<
  TInstallContext extends MultiplayerBridgeInstallContext = MultiplayerBridgeInstallContext,
  TSnapshot = any
>(options: MultiplayerModuleOptions<TInstallContext, TSnapshot>): GameModule<TInstallContext> {
  const moduleId = options.id ?? "gamekit.multiplayer.bridge";
  const commandKinds = new Set(options.commandKinds ?? ["game.command"]);
  const commandQueueCapacity = normalizePositiveInteger(options.commandQueue?.capacity, 256);
  const maxCommandsPerTick = normalizePositiveInteger(options.commandQueue?.maxPerTick, 64);
  const maxCommandAgeMs = normalizeDuration(options.commandQueue?.maxAgeMs);
  const overflowPolicy = options.commandQueue?.overflowPolicy ?? "reject-newest";
  const commandQueueClock = options.commandQueue?.clock ?? (() => Date.now());

  return {
    id: moduleId,
    install(ctx: TInstallContext) {
      const queue = createBoundedQueue<{
        message: MultiplayerMessageEnvelope;
        enqueuedAt: number;
      }>(commandQueueCapacity);
      const queueDiagnostics: MultiplayerCommandQueueDiagnostics = {
        capacity: queue.capacity,
        queued: 0,
        maxQueued: 0,
        received: 0,
        handled: 0,
        rejected: 0,
        overflowed: 0,
        expired: 0
      };
      const cleanup: Array<() => void> = [];

      function emitQueueDiagnostics(code?: string, messageId?: string): void {
        queueDiagnostics.queued = queue.length;
        queueDiagnostics.maxQueued = Math.max(queueDiagnostics.maxQueued, queue.length);
        if (code === undefined) {
          delete queueDiagnostics.lastCode;
        } else {
          queueDiagnostics.lastCode = code;
        }
        if (messageId === undefined) {
          delete queueDiagnostics.lastMessageId;
        } else {
          queueDiagnostics.lastMessageId = messageId;
        }
        options.commandQueue?.onDiagnostics?.(cloneCommandQueueDiagnostics(queueDiagnostics));
      }

      function emitOverflow(message: MultiplayerMessageEnvelope, code: string): void {
        queueDiagnostics.overflowed += 1;
        ctx.eventBus.emit(
          "multiplayer.command.overflow",
          {
            messageId: message.id,
            peerId: message.sourcePeerId,
            code,
            policy: overflowPolicy
          },
          moduleId
        );
        emitQueueDiagnostics(code, message.id);
      }

      if (options.handleCommand) {
        const unsubscribe = options.runtime.subscribe((message) => {
          if (commandKinds.has(message.kind)) {
            queueDiagnostics.received += 1;
            const entry = { message, enqueuedAt: commandQueueClock() };
            if (queue.enqueue(entry)) {
              emitQueueDiagnostics();
              return;
            }

            if (overflowPolicy === "drop-oldest") {
              const dropped = queue.dequeue();
              if (dropped !== undefined) {
                emitOverflow(dropped.message, "command-queue-dropped");
              }
              queue.enqueue(entry);
              emitQueueDiagnostics();
              return;
            }

            emitOverflow(message, "command-queue-full");
          }
        });
        cleanup.push(unsubscribe);

        ctx.systems.register({
          id: `${moduleId}.commands`,
          update() {
            const pending = Math.min(queue.length, maxCommandsPerTick);
            for (let index = 0; index < pending; index += 1) {
              const entry = queue.dequeue();
              if (!entry) {
                continue;
              }
              const message = entry.message;
              if (commandQueueClock() - entry.enqueuedAt > maxCommandAgeMs) {
                queueDiagnostics.expired += 1;
                ctx.eventBus.emit(
                  "multiplayer.command.expired",
                  {
                    messageId: message.id,
                    peerId: message.sourcePeerId,
                    code: "command-expired"
                  },
                  moduleId
                );
                emitQueueDiagnostics("command-expired", message.id);
                continue;
              }

              const commandContext: MultiplayerCommandContext<TInstallContext> = {
                installContext: ctx,
                runtime: options.runtime,
                message
              };
              const decision = options.authority?.(commandContext) ?? { allowed: true };
              if (!decision.allowed) {
                queueDiagnostics.rejected += 1;
                ctx.eventBus.emit(
                  "multiplayer.command.rejected",
                  {
                    messageId: message.id,
                    peerId: message.sourcePeerId,
                    code: decision.code,
                    reason: decision.reason
                  },
                  moduleId
                );
                emitQueueDiagnostics(decision.code, message.id);
                continue;
              }

              ctx.eventBus.emit(
                "multiplayer.command.accepted",
                {
                  messageId: message.id,
                  peerId: message.sourcePeerId,
                  kind: message.kind
                },
                moduleId
              );
              options.handleCommand?.(commandContext);
              queueDiagnostics.handled += 1;
              emitQueueDiagnostics();
            }
            emitQueueDiagnostics();
          }
        });
      }

      if (options.presentation) {
        const presentation = options.presentation;
        const playback = createSnapshotPlayback<TSnapshot>(presentation);
        const projector = createSnapshotPresentationProjector<TSnapshot>(presentation.tracks ?? []);
        ctx.systems.register({
          id: presentation.id ?? `${moduleId}.presentation`,
          update(frame = {}) {
            const entry = presentation.readSnapshot({
              installContext: ctx,
              runtime: options.runtime,
              frame
            });
            const sample =
              entry === undefined
                ? playback.advance(frame.delta ?? 0)
                : playback.present(entry, frame.delta ?? 0);
            const snapshot = entry?.snapshot ?? sample.next?.snapshot ?? sample.previous?.snapshot;
            if (snapshot === undefined) {
              return;
            }
            const presented = projector.present(sample);

            presentation.applySample({
              installContext: ctx,
              runtime: options.runtime,
              frame,
              playback,
              sample,
              presented,
              snapshot
            });
          }
        });
        cleanup.push(() => {
          playback.reset();
          projector.reset();
        });
      }

      return () => {
        queue.clear();
        emitQueueDiagnostics();
        for (const dispose of cleanup.splice(0).reverse()) {
          dispose();
        }
      };
    }
  };
}

/** @deprecated Use createMultiplayerModule. */
export function createMultiplayerBridgeModule<
  TInstallContext extends MultiplayerBridgeInstallContext = MultiplayerBridgeInstallContext,
  TSnapshot = any
>(
  options: CreateMultiplayerBridgeModuleOptions<TInstallContext, TSnapshot>
): GameModule<TInstallContext> {
  return createMultiplayerModule<TInstallContext, TSnapshot>(options);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(1, Math.floor(value));
}

function normalizeDuration(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, value);
}

function cloneCommandQueueDiagnostics(
  diagnostics: MultiplayerCommandQueueDiagnostics
): MultiplayerCommandQueueDiagnostics {
  return {
    capacity: diagnostics.capacity,
    queued: diagnostics.queued,
    maxQueued: diagnostics.maxQueued,
    received: diagnostics.received,
    handled: diagnostics.handled,
    rejected: diagnostics.rejected,
    overflowed: diagnostics.overflowed,
    expired: diagnostics.expired,
    ...(diagnostics.lastCode === undefined ? {} : { lastCode: diagnostics.lastCode }),
    ...(diagnostics.lastMessageId === undefined ? {} : { lastMessageId: diagnostics.lastMessageId })
  };
}
