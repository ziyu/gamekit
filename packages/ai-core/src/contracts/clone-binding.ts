import type { AiAgentBinding } from "./agent-binding";

export function cloneAiAgentBinding(binding: AiAgentBinding): AiAgentBinding {
  return { ...binding };
}
