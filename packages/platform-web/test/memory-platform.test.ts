import { describe, expect, it } from "vitest";
import { createMemoryPlatform } from "../src";

describe("memory platform profile fixture", () => {
  it("uses isolated memory-backed filesystem and storage services", async () => {
    const first = createMemoryPlatform({ id: "deterministic-test", appName: "Fixture A" });
    const second = createMemoryPlatform({ id: "deterministic-test", appName: "Fixture B" });

    await first.services.storage.setItem("slot", "one");
    await first.services.fs.writeText("save.json", "{}", { baseDir: "appData" });

    await expect(first.services.storage.getItem("slot")).resolves.toBe("one");
    await expect(second.services.storage.getItem("slot")).resolves.toBeUndefined();
    await expect(first.services.fs.readText("save.json", { baseDir: "appData" })).resolves.toBe(
      "{}"
    );
    await expect(second.services.fs.exists("save.json", { baseDir: "appData" })).resolves.toBe(
      false
    );
    await expect(first.services.app.name()).resolves.toBe("Fixture A");
    expect(first.id).toBe("deterministic-test");
  });
});
