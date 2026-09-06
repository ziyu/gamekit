import { expect, it } from "vitest";
import { createStoredVersion, validVersion } from "../src/adapter/integrity";

it("treats non-serializable native metadata as corruption so backup selection can continue", async () => {
  const version = await createStoredVersion(new Uint8Array([1]), { id: "slot" });
  expect(await validVersion(version, "slot")).toBe(true);
  Object.assign(version.metadata, { corrupted: version.metadata });
  expect(await validVersion(version, "slot")).toBe(false);
});
