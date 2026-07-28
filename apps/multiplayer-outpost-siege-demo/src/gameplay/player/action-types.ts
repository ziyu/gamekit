import type { OutpostPlayerAction } from "../../domain";

export type OutpostAuthorityPlayerActionCommand = {
  id: string;
  playerId: string;
  action: OutpostPlayerAction;
  aimX: number;
  aimY: number;
  correlationId?: string | undefined;
  parentId?: string | undefined;
};
