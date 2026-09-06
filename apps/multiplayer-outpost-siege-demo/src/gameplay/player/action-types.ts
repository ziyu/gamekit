import type { OutpostPlayerAction } from "../../domain";

export type OutpostAuthorityPlayerActionCommand = {
  id: string;
  playerId: string;
  action: OutpostPlayerAction;
  aimX: number;
  aimY: number;
  fireSequence?: number | undefined;
  fireHeld?: boolean | undefined;
  dashSequence?: number | undefined;
  correlationId?: string | undefined;
  parentId?: string | undefined;
};
