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
      "@gamekit/driver-core": new URL("./packages/driver-core/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/driver-phaser": new URL("./packages/driver-phaser/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/asset": new URL("./packages/asset/src/index.ts", import.meta.url).pathname,
      "@gamekit/app-host": new URL("./packages/app-host/src/index.ts", import.meta.url).pathname,
      "@gamekit/tca": new URL("./packages/tca/src/index.ts", import.meta.url).pathname,
      "@gamekit/gas": new URL("./packages/gas/src/index.ts", import.meta.url).pathname,
      "@gamekit/ui-core": new URL("./packages/ui-core/src/index.ts", import.meta.url).pathname,
      "@gamekit/react-ui": new URL("./packages/react-ui/src/index.ts", import.meta.url).pathname,
      "@gamekit/camera-core": new URL("./packages/camera-core/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/input-core": new URL("./packages/input-core/src/index.ts", import.meta.url)
        .pathname,
      "@gamekit/input-dom": new URL("./packages/input-dom/src/index.ts", import.meta.url).pathname,
      "@gamekit/platform-core": new URL("./packages/platform-core/src/index.ts", import.meta.url)
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
