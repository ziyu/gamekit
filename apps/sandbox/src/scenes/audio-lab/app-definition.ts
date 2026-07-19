import { defineGameApp } from "@gamekit/app-host";

export const audioLabAppDefinition = defineGameApp({
  id: "sandbox.audio-lab",
  services: [
    { id: "drivers" },
    { id: "assets", dependencies: ["drivers"] },
    { id: "audio", dependencies: ["drivers", "assets"] }
  ]
});
