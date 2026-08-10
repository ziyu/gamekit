export type AiDueWorkKey = {
  dueAt: number;
  priority: number;
  agentId: string;
  itemId?: string | undefined;
};

export function compareAiDueWork(left: AiDueWorkKey, right: AiDueWorkKey): number {
  if (left.dueAt !== right.dueAt) {
    return left.dueAt - right.dueAt;
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  const agentOrder = left.agentId.localeCompare(right.agentId);
  if (agentOrder !== 0) {
    return agentOrder;
  }
  return (left.itemId ?? "").localeCompare(right.itemId ?? "");
}
