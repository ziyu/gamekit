import type { DataRegistry } from "@gamekit/data";
import type { OutpostIdentityRegistry } from "../domain";

export type OutpostGameplayContext = {
  data: DataRegistry;
  identities: OutpostIdentityRegistry;
};
