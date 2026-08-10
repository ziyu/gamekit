import type { AiAgentBinding } from "../contracts/agent-binding";
import { cloneAiRecord } from "../contracts/clone-runtime-value";
import type { AiAgentCheckpoint, AiRestoreOptions } from "./checkpoint";

export function restoreAiTaskState(
  checkpoint: AiAgentCheckpoint,
  binding: AiAgentBinding,
  elapsed: number,
  options: AiRestoreOptions | undefined
): AiAgentCheckpoint {
  if (checkpoint.task === undefined || options?.resolveTaskState === undefined) {
    return checkpoint;
  }
  const state = options.resolveTaskState(cloneAiRecord(checkpoint.task.state), { ...binding });
  if (state === undefined) {
    return {
      ...checkpoint,
      binding,
      currentGoalId: undefined,
      currentGoalScore: undefined,
      committedUntil: undefined,
      task: undefined,
      nextDecisionAt: elapsed
    };
  }
  return {
    ...checkpoint,
    binding,
    task: { ...checkpoint.task, state: cloneAiRecord(state) }
  };
}
