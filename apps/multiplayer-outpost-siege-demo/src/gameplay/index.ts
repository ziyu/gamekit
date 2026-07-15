import type { DataRegistry } from "@gamekit/data";
import type { OutpostIdentityRegistry } from "../domain";

export type OutpostGameplayContext = {
  data: DataRegistry;
  identities: OutpostIdentityRegistry;
};
export * from "./authority-runtime";
export * from "./client-shadow-runtime";
export * from "./components";
export * from "./constants";
export * from "./input";
export * from "./preview-runtime";
