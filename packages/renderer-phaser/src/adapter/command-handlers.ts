import { GameError } from "@gamekit/core";
import type { RenderCommand } from "@gamekit/renderer-core";
import { resolveNodePath, type PhaserRenderRecord } from "./object-registry";

export function applyRenderCommand(record: PhaserRenderRecord, command: RenderCommand): void {
  if (command.type !== "animation.play") {
    throw new GameError(
      "renderer.unsupported_command",
      `Unsupported render command: ${command.type}`,
      {
        objectId: record.id,
        commandType: command.type
      }
    );
  }

  const target = resolveCommandTarget(record, command);
  const animationId = command.args?.animationId;
  if (typeof animationId !== "string") {
    throw new GameError("renderer.invalid_command", "animation.play requires args.animationId", {
      objectId: record.id,
      commandType: command.type
    });
  }

  target.play?.(animationId);
}

function resolveCommandTarget(record: PhaserRenderRecord, command: RenderCommand): any {
  if (!command.target) {
    return record.native;
  }

  const nodePath = resolveNodePath(command.target);
  const node = record.nodes.get(nodePath);
  if (!node) {
    throw new GameError("renderer.missing_node", `Missing render node: ${nodePath}`, {
      objectId: record.id,
      nodePath
    });
  }

  return node;
}
