import type { DataPackEntry } from "@gamekit/data";

export const sandboxCoreEntries: DataPackEntry[] = [
  {
    type: "sandbox.sceneLayout",
    id: "sceneLayout.sandbox.signal_outpost",
    data: {
      id: "sceneLayout.sandbox.signal_outpost",
      name: "Signal Outpost",
      objectIds: [
        "scene.sandbox.command_core",
        "scene.sandbox.relay_northwest",
        "scene.sandbox.relay_north",
        "scene.sandbox.relay_east",
        "scene.sandbox.data_node",
        "scene.sandbox.asset_fabricator",
        "scene.sandbox.interference"
      ],
      links: [
        {
          id: "link.relay_northwest.core",
          fromObjectId: "scene.sandbox.relay_northwest",
          toObjectId: "scene.sandbox.command_core",
          routeId: "route.relay_northwest.core"
        },
        {
          id: "link.relay_north.core",
          fromObjectId: "scene.sandbox.relay_north",
          toObjectId: "scene.sandbox.command_core",
          routeId: "route.relay_north.core"
        },
        {
          id: "link.relay_east.core",
          fromObjectId: "scene.sandbox.relay_east",
          toObjectId: "scene.sandbox.command_core",
          routeId: "route.relay_east.core"
        },
        {
          id: "link.data.core",
          fromObjectId: "scene.sandbox.data_node",
          toObjectId: "scene.sandbox.command_core",
          routeId: "route.data.core"
        },
        {
          id: "link.asset.core",
          fromObjectId: "scene.sandbox.asset_fabricator",
          toObjectId: "scene.sandbox.command_core",
          routeId: "route.asset.core"
        },
        {
          id: "link.interference.core",
          fromObjectId: "scene.sandbox.interference",
          toObjectId: "scene.sandbox.command_core",
          routeId: "route.interference.core",
          corrupted: true
        }
      ],
      scoutCount: 5,
      tags: ["sandbox", "layout", "signal-outpost"]
    }
  }
];
