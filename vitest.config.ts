import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@gamekit/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@gamekit/world": new URL("./packages/world/src/index.ts", import.meta.url).pathname,
      "@gamekit/world-koota": new URL("./packages/world-koota/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/event-bus": new URL("./packages/event-bus/src/index.ts", import.meta.url).pathname,
      "@gamekit/game-runtime": new URL("./packages/game-runtime/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/data": new URL("./packages/data/src/index.ts", import.meta.url).pathname,
      "@gamekit/asset": new URL("./packages/asset/src/index.ts", import.meta.url).pathname,
      "@gamekit/asset-phaser": new URL("./packages/asset-phaser/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/renderer-core": new URL("./packages/renderer-core/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/renderer-phaser": new URL(
        "./packages/renderer-phaser/src/index.ts",
        import.meta.url
      ).pathname,
      "@gamekit/test-utils": new URL("./packages/test-utils/src/index.ts", import.meta.url).pathname
    }
  }
});
