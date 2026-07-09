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

export type CreateMultiplayerBridgeModuleOptions<
  TInstallContext extends MultiplayerBridgeInstallContext,
  TSnapshot = any
> = {
  id?: string;
  runtime: MultiplayerRuntime;
  commandKinds?: string[];
  authority?: MultiplayerAuthorityPolicy<TInstallContext>;
  handleCommand?: MultiplayerCommandHandler<TInstallContext>;
  presentation?: MultiplayerPresentationBridgeOptions<TSnapshot, TInstallContext>;
};

export function createMultiplayerBridgeModule<
  TInstallContext extends MultiplayerBridgeInstallContext = MultiplayerBridgeInstallContext,
  TSnapshot = any
>(
  options: CreateMultiplayerBridgeModuleOptions<TInstallContext, TSnapshot>
): GameModule<TInstallContext> {
  const moduleId = options.id ?? "gamekit.multiplayer.bridge";
  const commandKinds = new Set(options.commandKinds ?? ["game.command"]);

  return {
    id: moduleId,
    install(ctx: TInstallContext) {
      const queue: MultiplayerMessageEnvelope[] = [];
      const cleanup: Array<() => void> = [];

      if (options.handleCommand) {
        const unsubscribe = options.runtime.subscribe((message) => {
          if (commandKinds.has(message.kind)) {
            queue.push(message);
          }
        });
        cleanup.push(unsubscribe);

        ctx.systems.register({
          id: `${moduleId}.commands`,
          update() {
            while (queue.length > 0) {
              const message = queue.shift();
              if (!message) {
                continue;
              }

              const commandContext: MultiplayerCommandContext<TInstallContext> = {
                installContext: ctx,
                runtime: options.runtime,
                message
              };
              const decision = options.authority?.(commandContext) ?? { allowed: true };
              if (!decision.allowed) {
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
            }
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
        queue.length = 0;
        for (const dispose of cleanup.splice(0).reverse()) {
          dispose();
        }
      };
    }
  };
}
