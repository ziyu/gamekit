import type { OutpostGameplayContext } from "../gameplay";

export * from "./outpost-room-authority-runtime";
export * from "./outpost-siege-room";

export type OutpostAuthorityBootstrapContext = OutpostGameplayContext & {
  sessionId: string;
  seed: string;
};
