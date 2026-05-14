import type { DataPackEntry } from "@gamekit/data";

export const sandboxThreatEntries: DataPackEntry[] = [
  {
    type: "sandbox.threatProfile",
    id: "threat.sandbox.signal_storm",
    data: {
      id: "threat.sandbox.signal_storm",
      label: "Signal Storm",
      cadenceTicks: 150,
      effectId: "gas.effect.sandbox.interference_mark",
      targetRoles: ["relay-tower", "command-core"],
      tags: ["sandbox", "threat", "signal"]
    }
  },
  {
    type: "sandbox.threatProfile",
    id: "threat.sandbox.data_corruption",
    data: {
      id: "threat.sandbox.data_corruption",
      label: "Data Corruption",
      cadenceTicks: 210,
      effectId: "gas.effect.sandbox.interference_mark",
      targetRoles: ["data-node"],
      tags: ["sandbox", "threat", "data"]
    }
  },
  {
    type: "sandbox.threatProfile",
    id: "threat.sandbox.scout_jam",
    data: {
      id: "threat.sandbox.scout_jam",
      label: "Scout Jam",
      cadenceTicks: 180,
      effectId: "gas.effect.sandbox.signal_damage",
      targetRoles: ["scout"],
      tags: ["sandbox", "threat", "worker"]
    }
  },
  {
    type: "gas.effect",
    id: "gas.effect.sandbox.signal_damage",
    data: {
      id: "gas.effect.sandbox.signal_damage",
      name: "Signal Damage",
      attributeModifiers: [
        {
          attribute: "health",
          operation: "add",
          value: -7
        }
      ],
      grantedTags: ["state.marked"],
      durationMs: 600,
      cues: ["cue.sandbox.signal_hit"],
      tags: ["sandbox", "effect", "damage"]
    }
  },
  {
    type: "gas.effect",
    id: "gas.effect.sandbox.overcharge_regen",
    data: {
      id: "gas.effect.sandbox.overcharge_regen",
      name: "Overcharge Regen",
      durationMs: 1000,
      periodMs: 250,
      periodicModifiers: [
        {
          attribute: "energy",
          operation: "add",
          value: 2
        }
      ],
      grantedTags: ["state.overcharged"],
      cues: ["cue.sandbox.pulse"],
      tags: ["sandbox", "effect", "periodic"]
    }
  },
  {
    type: "gas.effect",
    id: "gas.effect.sandbox.interference_mark",
    data: {
      id: "gas.effect.sandbox.interference_mark",
      name: "Interference Mark",
      attributeModifiers: [
        {
          attribute: "stability",
          operation: "add",
          value: -8
        }
      ],
      grantedTags: ["state.interfered"],
      durationMs: 1200,
      cues: ["cue.sandbox.signal_hit"],
      tags: ["sandbox", "effect", "threat"]
    }
  },
  {
    type: "gas.effect",
    id: "gas.effect.sandbox.field_repair",
    data: {
      id: "gas.effect.sandbox.field_repair",
      name: "Field Repair",
      durationMs: 1400,
      periodMs: 350,
      periodicModifiers: [
        {
          attribute: "stability",
          operation: "add",
          value: 4
        }
      ],
      cues: ["cue.sandbox.pulse"],
      tags: ["sandbox", "effect", "repair"]
    }
  },
  {
    type: "gas.effect",
    id: "gas.effect.sandbox.signal_boost",
    data: {
      id: "gas.effect.sandbox.signal_boost",
      name: "Signal Boost",
      durationMs: 1800,
      attributeModifiers: [
        {
          attribute: "throughput",
          operation: "add",
          value: 20
        }
      ],
      grantedTags: ["state.overcharged"],
      cues: ["cue.sandbox.pulse"],
      tags: ["sandbox", "effect", "boost"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.confirm_signal",
    data: {
      id: "rule.sandbox.confirm_signal",
      trigger: {
        type: "sandbox.input_action",
        args: {
          actionId: "game.confirm",
          phase: "pressed"
        }
      },
      conditions: [
        {
          type: "sandbox.entity_count",
          args: {
            min: 5,
            max: 32
          }
        }
      ],
      actions: [
        {
          type: "sandbox.log",
          args: {
            message: "Confirm input routed through TCA"
          }
        },
        {
          type: "event.emit",
          args: {
            eventType: "sandbox.tca_confirmed",
            payload: {
              ruleId: "rule.sandbox.confirm_signal"
            }
          }
        }
      ],
      priority: 10,
      tags: ["sandbox", "tca", "input"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.motion_heartbeat",
    data: {
      id: "rule.sandbox.motion_heartbeat",
      trigger: {
        type: "sandbox.motion_interval",
        args: {
          everyTicks: 120
        }
      },
      conditions: [
        {
          type: "sandbox.data_tag_exists",
          args: {
            type: "sandbox.ability",
            tag: "diagnostic"
          }
        }
      ],
      actions: [
        {
          type: "sandbox.log",
          args: {
            message: "Motion heartbeat observed by TCA"
          }
        },
        {
          type: "sandbox.data_summary",
          args: {
            type: "sandbox.ability"
          }
        }
      ],
      priority: 3,
      tags: ["sandbox", "tca", "runtime"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.camera_input_trace",
    data: {
      id: "rule.sandbox.camera_input_trace",
      trigger: {
        type: "sandbox.input_action",
        args: {
          actionIds: [
            "camera.pan_up",
            "camera.pan_down",
            "camera.pan_left",
            "camera.pan_right",
            "camera.zoom_in",
            "camera.zoom_out"
          ]
        }
      },
      actions: [
        {
          type: "sandbox.log",
          args: {
            message: "Camera input was routed through the scoped game viewport"
          }
        },
        {
          type: "event.emit",
          args: {
            eventType: "sandbox.tca_camera_input",
            payload: {
              group: "camera"
            }
          }
        }
      ],
      priority: 5,
      tags: ["sandbox", "tca", "camera"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.spawn_catalog_once",
    data: {
      id: "rule.sandbox.spawn_catalog_once",
      trigger: {
        type: "event.type",
        args: {
          eventType: "sandbox.entity_spawned"
        }
      },
      conditions: [
        {
          type: "sandbox.entity_count",
          args: {
            min: 1
          }
        }
      ],
      actions: [
        {
          type: "sandbox.data_summary",
          args: {
            type: "sandbox.spawnProfile"
          }
        },
        {
          type: "event.emit",
          args: {
            eventType: "sandbox.tca_spawn_catalog_ready",
            payload: {
              sourceRule: "rule.sandbox.spawn_catalog_once"
            }
          }
        }
      ],
      once: true,
      priority: 20,
      tags: ["sandbox", "tca", "data", "once"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.gas_signal_strike",
    data: {
      id: "rule.sandbox.gas_signal_strike",
      trigger: {
        type: "event.type",
        args: {
          eventType: "sandbox.motion_tick"
        }
      },
      conditions: [
        {
          type: "gas.attribute.compare",
          args: {
            actorId: "gas.actor.sandbox.scout.0",
            attribute: "energy",
            operator: ">=",
            value: 3
          }
        },
        {
          type: "gas.attribute.compare",
          args: {
            actorId: "gas.actor.sandbox.scout.1",
            attribute: "health",
            operator: ">",
            value: 0
          }
        }
      ],
      actions: [
        {
          type: "gas.activate_ability",
          args: {
            actorId: "gas.actor.sandbox.scout.0",
            abilityId: "gas.ability.sandbox.signal_strike",
            targetActorId: "gas.actor.sandbox.scout.1"
          }
        }
      ],
      priority: 15,
      tags: ["sandbox", "tca", "gas", "ability"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.gas_overcharge",
    data: {
      id: "rule.sandbox.gas_overcharge",
      trigger: {
        type: "sandbox.input_action",
        args: {
          actionId: "game.confirm",
          phase: "pressed"
        }
      },
      conditions: [
        {
          type: "gas.actor.has_tag",
          args: {
            actorId: "gas.actor.sandbox.scout.0",
            tag: "team.scout"
          }
        }
      ],
      actions: [
        {
          type: "gas.activate_ability",
          args: {
            actorId: "gas.actor.sandbox.scout.0",
            abilityId: "gas.ability.sandbox.overcharge",
            targetActorId: "gas.actor.sandbox.scout.0"
          }
        }
      ],
      priority: 16,
      tags: ["sandbox", "tca", "gas", "input"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.interference_response",
    data: {
      id: "rule.sandbox.interference_response",
      trigger: {
        type: "event.type",
        args: {
          eventType: "sandbox.interference_strike"
        }
      },
      actions: [
        {
          type: "sandbox.log",
          args: {
            message: "Interference strike routed to field repair response"
          }
        },
        {
          type: "gas.activate_ability",
          args: {
            actorId: "gas.actor.sandbox.scout.0",
            abilityId: "gas.ability.sandbox.field_repair",
            targetActorId: "gas.actor.sandbox.relay.northwest"
          }
        }
      ],
      priority: 18,
      tags: ["sandbox", "tca", "gas", "threat"]
    }
  },
  {
    type: "tca.rule",
    id: "rule.sandbox.objective_milestone",
    data: {
      id: "rule.sandbox.objective_milestone",
      trigger: {
        type: "event.type",
        args: {
          eventType: "sandbox.objective_progress"
        }
      },
      actions: [
        {
          type: "sandbox.log",
          args: {
            message: "Command Core progress observed by TCA"
          }
        }
      ],
      priority: 4,
      tags: ["sandbox", "tca", "objective"]
    }
  }
];
