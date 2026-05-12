import { defineGameApp } from "@gamekit/app-host";
import { SANDBOX_ASSET_GROUP, SANDBOX_RENDER_SIZE } from "./game";

export const sandboxAppDefinition = defineGameApp({
  id: "sandbox",
  configSources: [
    {
      id: "sandbox.defaults",
      priority: 0,
      values: {
        renderer: SANDBOX_RENDER_SIZE,
        assets: {
          preloadGroups: [SANDBOX_ASSET_GROUP]
        },
        platform: {
          profile: "web"
        }
      }
    }
  ],
  services: [
    { id: "platform" },
    { id: "data" },
    {
      id: "renderer",
      config: {
        debug: true,
        width: SANDBOX_RENDER_SIZE.width,
        height: SANDBOX_RENDER_SIZE.height
      }
    },
    {
      id: "assets",
      config: {
        preloadGroups: [SANDBOX_ASSET_GROUP]
      },
      dependencies: ["data", "renderer"]
    },
    {
      id: "camera",
      dependencies: ["renderer"]
    },
    {
      id: "input",
      dependencies: ["renderer", "camera"]
    },
    {
      id: "game",
      dependencies: ["assets", "renderer", "camera"]
    }
  ]
});
