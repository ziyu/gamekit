import type { OutpostGameplayContext } from "../gameplay";

export type OutpostAuthorityBootstrapContext = OutpostGameplayContext & {
  sessionId: string;
  seed: string;
};
