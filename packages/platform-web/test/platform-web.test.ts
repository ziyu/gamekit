import { createPlatformUnsupportedError } from "@gamekit/platform-core";
import { definePlatformConformanceTests } from "@gamekit/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryStorage, createWebPlatform } from "../src";

definePlatformConformanceTests("Web", () =>
  createWebPlatform({
    appName: "Test Web App",
    storage: createMemoryStorage()
  })
);

describe("createWebPlatform", () => {
  it("fails clearly for unsupported open/save dialogs", async () => {
    const platform = createWebPlatform({ storage: createMemoryStorage() });

    await expect(platform.services.dialog.open()).rejects.toMatchObject({
      code: "platform.unsupported_capability"
    });
    await expect(platform.services.dialog.save()).rejects.toMatchObject({
      code: "platform.unsupported_capability"
    });
  });

  it("creates standard unsupported capability errors", () => {
    expect(createPlatformUnsupportedError("web", "shell.open")).toMatchObject({
      code: "platform.unsupported_capability"
    });
  });

  it("exposes standard capability descriptors", () => {
    const platform = createWebPlatform({ storage: createMemoryStorage() });

    expect(platform.capabilities.list().map((capability) => capability.id)).toContain("storage");
    expect(platform.capabilities.describe("fs.write")).toMatchObject({
      service: "platform.fs"
    });
  });
});
