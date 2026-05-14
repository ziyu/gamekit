import type { DataPackEntry } from "@gamekit/data";

export const sandboxStationEntries: DataPackEntry[] = [
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.command_core",
    data: {
      id: "scene.sandbox.command_core",
      label: "Command Core",
      role: "command-core",
      x: 50,
      y: 50,
      renderObjectId: "render.sandbox.command_core",
      renderRigId: "renderRig.sandbox.command_core",
      gasActorDefinitionId: "gas.actor.sandbox.station",
      stationDefinitionId: "station.sandbox.command_core",
      capacity: 260,
      tags: ["sandbox", "station", "objective"]
    }
  },
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.relay_northwest",
    data: {
      id: "scene.sandbox.relay_northwest",
      label: "Relay NW",
      role: "relay-tower",
      x: 24,
      y: 30,
      renderObjectId: "render.sandbox.relay_tower",
      renderRigId: "renderRig.sandbox.relay_tower",
      gasActorDefinitionId: "gas.actor.sandbox.station",
      stationDefinitionId: "station.sandbox.relay_northwest",
      capacity: 80,
      productionRate: 7,
      productionRecipeId: "recipe.sandbox.signal_pulse",
      tags: ["sandbox", "station", "producer"]
    }
  },
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.relay_north",
    data: {
      id: "scene.sandbox.relay_north",
      label: "Relay North",
      role: "relay-tower",
      x: 50,
      y: 20,
      renderObjectId: "render.sandbox.relay_tower",
      renderRigId: "renderRig.sandbox.relay_tower",
      gasActorDefinitionId: "gas.actor.sandbox.station",
      stationDefinitionId: "station.sandbox.relay_north",
      capacity: 90,
      productionRate: 8,
      productionRecipeId: "recipe.sandbox.signal_pulse",
      tags: ["sandbox", "station", "producer"]
    }
  },
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.relay_east",
    data: {
      id: "scene.sandbox.relay_east",
      label: "Relay East",
      role: "relay-tower",
      x: 76,
      y: 34,
      renderObjectId: "render.sandbox.relay_tower",
      renderRigId: "renderRig.sandbox.relay_tower",
      gasActorDefinitionId: "gas.actor.sandbox.station",
      stationDefinitionId: "station.sandbox.relay_east",
      capacity: 80,
      productionRate: 7.5,
      productionRecipeId: "recipe.sandbox.signal_pulse",
      tags: ["sandbox", "station", "producer"]
    }
  },
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.data_node",
    data: {
      id: "scene.sandbox.data_node",
      label: "Data Node",
      role: "data-node",
      x: 20,
      y: 74,
      renderObjectId: "render.sandbox.data_node",
      renderRigId: "renderRig.sandbox.data_node",
      stationDefinitionId: "station.sandbox.data_node",
      capacity: 40,
      productionRecipeId: "recipe.sandbox.rule_decode",
      tags: ["sandbox", "data", "definition"]
    }
  },
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.asset_fabricator",
    data: {
      id: "scene.sandbox.asset_fabricator",
      label: "Asset Fabricator",
      role: "asset-fabricator",
      x: 80,
      y: 74,
      renderObjectId: "render.sandbox.asset_fabricator",
      renderRigId: "renderRig.sandbox.asset_fabricator",
      stationDefinitionId: "station.sandbox.asset_fabricator",
      capacity: 40,
      productionRecipeId: "recipe.sandbox.module_fragment",
      tags: ["sandbox", "asset", "loader"]
    }
  },
  {
    type: "sandbox.sceneObject",
    id: "scene.sandbox.interference",
    data: {
      id: "scene.sandbox.interference",
      label: "Interference Node",
      role: "interference-node",
      x: 50,
      y: 86,
      renderObjectId: "render.sandbox.interference_node",
      renderRigId: "renderRig.sandbox.interference_node",
      gasActorDefinitionId: "gas.actor.sandbox.interference",
      stationDefinitionId: "station.sandbox.interference",
      capacity: 0,
      tags: ["sandbox", "threat"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.command_core",
    data: {
      id: "station.sandbox.command_core",
      label: "Command Core",
      zone: "core",
      priority: 5,
      initialStability: 92,
      baseHeat: 8,
      throughput: 1.25,
      supportedTasks: ["deliver", "repair"],
      tags: ["sandbox", "station", "core"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.relay_northwest",
    data: {
      id: "station.sandbox.relay_northwest",
      label: "Relay NW",
      zone: "signal-field",
      priority: 4,
      initialStability: 92,
      baseHeat: 18,
      throughput: 1.1,
      supportedTasks: ["collect", "repair"],
      tags: ["sandbox", "station", "signal-field"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.relay_north",
    data: {
      id: "station.sandbox.relay_north",
      label: "Relay North",
      zone: "signal-field",
      priority: 5,
      initialStability: 92,
      baseHeat: 18,
      throughput: 1.1,
      supportedTasks: ["collect", "repair"],
      tags: ["sandbox", "station", "signal-field"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.relay_east",
    data: {
      id: "station.sandbox.relay_east",
      label: "Relay East",
      zone: "signal-field",
      priority: 4,
      initialStability: 92,
      baseHeat: 18,
      throughput: 1.1,
      supportedTasks: ["collect", "repair"],
      tags: ["sandbox", "station", "signal-field"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.data_node",
    data: {
      id: "station.sandbox.data_node",
      label: "Data Node",
      zone: "archive-wing",
      priority: 3,
      initialStability: 92,
      baseHeat: 8,
      throughput: 0.85,
      supportedTasks: ["deliver", "scan", "repair"],
      tags: ["sandbox", "station", "archive-wing"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.asset_fabricator",
    data: {
      id: "station.sandbox.asset_fabricator",
      label: "Asset Fabricator",
      zone: "fabrication-bay",
      priority: 3,
      initialStability: 92,
      baseHeat: 8,
      throughput: 0.85,
      supportedTasks: ["deliver", "scan", "repair"],
      tags: ["sandbox", "station", "fabrication-bay"]
    }
  },
  {
    type: "sandbox.station",
    id: "station.sandbox.interference",
    data: {
      id: "station.sandbox.interference",
      label: "Interference Node",
      zone: "rift",
      priority: 6,
      initialStability: 100,
      baseHeat: 8,
      throughput: 0.85,
      supportedTasks: ["suppress", "scan"],
      tags: ["sandbox", "station", "rift"]
    }
  },
  {
    type: "sandbox.productionRecipe",
    id: "recipe.sandbox.signal_pulse",
    data: {
      id: "recipe.sandbox.signal_pulse",
      label: "Signal Pulse",
      input: [],
      output: {
        resource: "signal",
        amount: 1
      },
      durationMs: 1000,
      stationRole: "relay-tower",
      tags: ["sandbox", "production", "signal"]
    }
  },
  {
    type: "sandbox.productionRecipe",
    id: "recipe.sandbox.core_uplink",
    data: {
      id: "recipe.sandbox.core_uplink",
      label: "Core Uplink",
      input: [
        {
          resource: "signal",
          amount: 40
        }
      ],
      output: {
        resource: "objective",
        amount: 40
      },
      durationMs: 1500,
      stationRole: "command-core",
      tags: ["sandbox", "production", "objective"]
    }
  },
  {
    type: "sandbox.productionRecipe",
    id: "recipe.sandbox.module_fragment",
    data: {
      id: "recipe.sandbox.module_fragment",
      label: "Module Fragment",
      input: [
        {
          resource: "signal",
          amount: 18
        }
      ],
      output: {
        resource: "fragment",
        amount: 1
      },
      durationMs: 2200,
      stationRole: "asset-fabricator",
      tags: ["sandbox", "production", "asset"]
    }
  },
  {
    type: "sandbox.productionRecipe",
    id: "recipe.sandbox.rule_decode",
    data: {
      id: "recipe.sandbox.rule_decode",
      label: "Rule Decode",
      input: [
        {
          resource: "fragment",
          amount: 2
        }
      ],
      output: {
        resource: "unlock",
        amount: 1
      },
      durationMs: 3200,
      stationRole: "data-node",
      tags: ["sandbox", "production", "data"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.relay_northwest.core",
    data: {
      id: "route.relay_northwest.core",
      fromObjectId: "scene.sandbox.relay_northwest",
      toObjectId: "scene.sandbox.command_core",
      capacity: 42,
      visual: "signal",
      tags: ["sandbox", "route"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.relay_north.core",
    data: {
      id: "route.relay_north.core",
      fromObjectId: "scene.sandbox.relay_north",
      toObjectId: "scene.sandbox.command_core",
      capacity: 46,
      visual: "signal",
      tags: ["sandbox", "route"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.relay_east.core",
    data: {
      id: "route.relay_east.core",
      fromObjectId: "scene.sandbox.relay_east",
      toObjectId: "scene.sandbox.command_core",
      capacity: 42,
      visual: "signal",
      tags: ["sandbox", "route"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.data.core",
    data: {
      id: "route.data.core",
      fromObjectId: "scene.sandbox.data_node",
      toObjectId: "scene.sandbox.command_core",
      capacity: 28,
      visual: "signal",
      tags: ["sandbox", "route"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.asset.core",
    data: {
      id: "route.asset.core",
      fromObjectId: "scene.sandbox.asset_fabricator",
      toObjectId: "scene.sandbox.command_core",
      capacity: 28,
      visual: "signal",
      tags: ["sandbox", "route"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.interference.core",
    data: {
      id: "route.interference.core",
      fromObjectId: "scene.sandbox.interference",
      toObjectId: "scene.sandbox.command_core",
      capacity: 20,
      visual: "threat",
      tags: ["sandbox", "route"]
    }
  },
  {
    type: "sandbox.outpostRoute",
    id: "route.data.asset",
    data: {
      id: "route.data.asset",
      fromObjectId: "scene.sandbox.data_node",
      toObjectId: "scene.sandbox.asset_fabricator",
      capacity: 16,
      visual: "signal",
      tags: ["sandbox", "route"]
    }
  }
];
