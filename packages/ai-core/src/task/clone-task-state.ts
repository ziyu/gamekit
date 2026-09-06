import { cloneAiRecord } from "../contracts/clone-runtime-value";
import type { AiTaskState } from "./task-executor";

export function cloneAiTaskState(task: AiTaskState): AiTaskState {
  return { ...task, state: cloneAiRecord(task.state) };
}
