import type { AiAgentBinding } from "../contracts/agent-binding";
import { cloneAiAgentBinding } from "../contracts/clone-binding";
import type { AiRestoreOptions } from "./checkpoint";

export function restoreAiAgentBinding(
  binding: AiAgentBinding,
  options: AiRestoreOptions | undefined
): AiAgentBinding | undefined {
  const restored = cloneAiAgentBinding(binding);
  if (binding.entityId !== undefined && options?.resolveEntityId !== undefined) {
    const entityId = options.resolveEntityId(binding.entityId);
    if (entityId === undefined) {
      return undefined;
    }
    restored.entityId = entityId;
  }
  if (binding.actorId !== undefined && options?.resolveActorId !== undefined) {
    const actorId = options.resolveActorId(binding.actorId);
    if (actorId === undefined) {
      return undefined;
    }
    restored.actorId = actorId;
  }
  return restored;
}
