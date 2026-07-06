import type { EventBus } from "@gamekit/event-bus";
import type { GameModule } from "@gamekit/core";
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

export type MultiplayerBridgeSystem = {
  id: string;
  update(): void;
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

export type CreateMultiplayerBridgeModuleOptions<
  TInstallContext extends MultiplayerBridgeInstallContext
> = {
  id?: string;
  runtime: MultiplayerRuntime;
  commandKinds?: string[];
  authority?: MultiplayerAuthorityPolicy<TInstallContext>;
  handleCommand: MultiplayerCommandHandler<TInstallContext>;
};

export function createMultiplayerBridgeModule<
  TInstallContext extends MultiplayerBridgeInstallContext = MultiplayerBridgeInstallContext
>(options: CreateMultiplayerBridgeModuleOptions<TInstallContext>): GameModule<TInstallContext> {
  const moduleId = options.id ?? "gamekit.multiplayer.bridge";
  const commandKinds = new Set(options.commandKinds ?? ["game.command"]);

  return {
    id: moduleId,
    install(ctx: TInstallContext) {
      const queue: MultiplayerMessageEnvelope[] = [];
      const unsubscribe = options.runtime.subscribe((message) => {
        if (commandKinds.has(message.kind)) {
          queue.push(message);
        }
      });

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
            options.handleCommand(commandContext);
          }
        }
      });

      return () => {
        queue.length = 0;
        unsubscribe();
      };
    }
  };
}
