import type { OutpostNetworkIdentity } from "../domain";

export type OutpostReplicatedEntityIdentity = OutpostNetworkIdentity & {
  gameplayObjectId: string;
  archetypeId: string;
};
