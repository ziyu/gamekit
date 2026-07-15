import type { OutpostNetworkIdentity } from "../domain";

export * from "./match-authority";
export * from "./browser-client";
export * from "./browser-protocol";

export type OutpostReplicatedEntityIdentity = OutpostNetworkIdentity & {
  gameplayObjectId: string;
  archetypeId: string;
};
