import type { DataPackEntry } from "@gamekit/data";

export const sandboxVisualEntries: DataPackEntry[] = [
  {
    type: "asset.definition",
    id: "asset.sandbox.entity_square",
    data: {
      id: "asset.sandbox.entity_square",
      type: "image",
      source: {
        type: "url",
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='2' width='28' height='28' rx='4' fill='white'/%3E%3C/svg%3E"
      },
      group: "sandbox.preload",
      tags: ["preload", "sandbox", "tintable"]
    }
  },
  {
    type: "asset.definition",
    id: "asset.sandbox.signal_ring",
    data: {
      id: "asset.sandbox.signal_ring",
      type: "image",
      source: {
        type: "url",
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='24' fill='none' stroke='white' stroke-width='7'/%3E%3C/svg%3E"
      },
      group: "sandbox.preload",
      tags: ["preload", "sandbox", "tintable", "ring"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.entity",
    data: {
      id: "render.sandbox.entity",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.36
            }
          },
          alpha: 0.2,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 30,
            height: 30,
            tint: 0,
            depth: -1
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.38,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 54,
            height: 54,
            tint: 6603472,
            depth: 0
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 24,
            height: 24,
            tint: 8376683,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 9,
            height: 9,
            tint: 15986920,
            depth: 3
          }
        },
        {
          id: "marker",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: -26
            }
          },
          children: [
            {
              id: "ring",
              type: "sprite",
              alpha: 0.72,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 18,
                height: 18,
                tint: 15777103,
                depth: 4
              }
            },
            {
              id: "pip",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 5,
                height: 5,
                tint: 15777103,
                depth: 5
              }
            }
          ]
        },
        {
          id: "thruster",
          type: "container",
          transform: {
            position: {
              x: -17,
              y: 11
            }
          },
          children: [
            {
              id: "left",
              type: "sprite",
              transform: {
                position: {
                  x: 0,
                  y: -4
                }
              },
              alpha: 0.55,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 8,
                height: 4,
                tint: 14497319,
                depth: 1
              }
            },
            {
              id: "right",
              type: "sprite",
              transform: {
                position: {
                  x: 0,
                  y: 4
                }
              },
              alpha: 0.55,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 8,
                height: 4,
                tint: 14497319,
                depth: 1
              }
            }
          ]
        }
      ],
      tags: ["sandbox", "complex", "object-tree"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.command_core",
    data: {
      id: "render.sandbox.command_core",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.32
            }
          },
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 70,
            height: 58,
            tint: 0,
            depth: -2
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.28,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 82,
            height: 82,
            tint: 6603472,
            depth: -1
          }
        },
        {
          id: "outer",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 68,
            height: 68,
            tint: 15986920,
            depth: 0
          }
        },
        {
          id: "inner",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 52,
            height: 52,
            tint: 14267231,
            depth: 1
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 34,
            height: 34,
            tint: 2570805,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 14,
            height: 14,
            tint: 15777103,
            depth: 3
          }
        },
        {
          id: "charge",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: 41
            }
          },
          children: [
            {
              id: "track",
              type: "sprite",
              alpha: 0.3,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 70,
                height: 4,
                tint: 15986920,
                depth: 4
              }
            },
            {
              id: "fill",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 2,
                height: 4,
                tint: 14267231,
                depth: 5
              }
            },
            {
              id: "ring",
              type: "sprite",
              alpha: 0.7,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 11,
                height: 11,
                tint: 14267231,
                depth: 6
              }
            }
          ]
        },
        {
          id: "beacon",
          type: "sprite",
          transform: {
            position: {
              x: 0,
              y: -38
            }
          },
          alpha: 0.78,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 20,
            height: 8,
            tint: 14267231,
            depth: 7
          }
        },
        {
          id: "cargo",
          type: "sprite",
          transform: {
            position: {
              x: 37,
              y: -19.333333333333332
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 16,
            height: 16,
            tint: 14267231,
            depth: 8
          }
        },
        {
          id: "task",
          type: "sprite",
          transform: {
            position: {
              x: -37,
              y: 19.333333333333332
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 6603472,
            depth: 9
          }
        },
        {
          id: "field",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 104,
            height: 104,
            tint: 14497319,
            depth: -3
          }
        },
        {
          id: "gear",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 62,
            height: 62,
            tint: 14267231,
            depth: 4
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "command-core"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.relay_tower",
    data: {
      id: "render.sandbox.relay_tower",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.32
            }
          },
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 56,
            height: 44,
            tint: 0,
            depth: -2
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 68,
            height: 68,
            tint: 6603472,
            depth: -1
          }
        },
        {
          id: "outer",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 54,
            height: 54,
            tint: 6603472,
            depth: 0
          }
        },
        {
          id: "inner",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 38,
            height: 38,
            tint: 8376683,
            depth: 1
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 18,
            height: 38,
            tint: 2771784,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 10,
            height: 10,
            tint: 15986920,
            depth: 3
          }
        },
        {
          id: "charge",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: 34
            }
          },
          children: [
            {
              id: "track",
              type: "sprite",
              alpha: 0.3,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 56,
                height: 4,
                tint: 15986920,
                depth: 4
              }
            },
            {
              id: "fill",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 2,
                height: 4,
                tint: 8376683,
                depth: 5
              }
            },
            {
              id: "ring",
              type: "sprite",
              alpha: 0.7,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 11,
                height: 11,
                tint: 8376683,
                depth: 6
              }
            }
          ]
        },
        {
          id: "beacon",
          type: "sprite",
          transform: {
            position: {
              x: 0,
              y: -31
            }
          },
          alpha: 0.78,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 16,
            height: 12,
            tint: 8376683,
            depth: 7
          }
        },
        {
          id: "cargo",
          type: "sprite",
          transform: {
            position: {
              x: 30,
              y: -14.666666666666666
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 16,
            height: 16,
            tint: 14267231,
            depth: 8
          }
        },
        {
          id: "task",
          type: "sprite",
          transform: {
            position: {
              x: -30,
              y: 14.666666666666666
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 6603472,
            depth: 9
          }
        },
        {
          id: "field",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 90,
            height: 90,
            tint: 14497319,
            depth: -3
          }
        },
        {
          id: "gear",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 48,
            height: 48,
            tint: 14267231,
            depth: 4
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "relay-tower"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.scout",
    data: {
      id: "render.sandbox.scout",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.32
            }
          },
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 42,
            height: 30,
            tint: 0,
            depth: -2
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.2,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 54,
            height: 54,
            tint: 8376683,
            depth: -1
          }
        },
        {
          id: "outer",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 40,
            height: 40,
            tint: 8376683,
            depth: 0
          }
        },
        {
          id: "inner",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 24,
            height: 24,
            tint: 15986920,
            depth: 1
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 24,
            height: 18,
            tint: 8376683,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 7,
            height: 7,
            tint: 1052686,
            depth: 3
          }
        },
        {
          id: "charge",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: 27
            }
          },
          children: [
            {
              id: "track",
              type: "sprite",
              alpha: 0.3,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 42,
                height: 4,
                tint: 15986920,
                depth: 4
              }
            },
            {
              id: "fill",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 2,
                height: 4,
                tint: 14267231,
                depth: 5
              }
            },
            {
              id: "ring",
              type: "sprite",
              alpha: 0.7,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 11,
                height: 11,
                tint: 14267231,
                depth: 6
              }
            }
          ]
        },
        {
          id: "beacon",
          type: "sprite",
          transform: {
            position: {
              x: 0,
              y: -24
            }
          },
          alpha: 0.78,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 10,
            height: 5,
            tint: 14267231,
            depth: 7
          }
        },
        {
          id: "cargo",
          type: "sprite",
          transform: {
            position: {
              x: 23,
              y: -10
            }
          },
          alpha: 0.5,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 16,
            height: 16,
            tint: 14267231,
            depth: 8
          }
        },
        {
          id: "task",
          type: "sprite",
          transform: {
            position: {
              x: -23,
              y: 10
            }
          },
          alpha: 0.74,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 6603472,
            depth: 9
          }
        },
        {
          id: "field",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 76,
            height: 76,
            tint: 14497319,
            depth: -3
          }
        },
        {
          id: "gear",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 34,
            height: 34,
            tint: 14267231,
            depth: 4
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "scout"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.data_node",
    data: {
      id: "render.sandbox.data_node",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.32
            }
          },
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 50,
            height: 38,
            tint: 0,
            depth: -2
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.18,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 62,
            height: 62,
            tint: 10324440,
            depth: -1
          }
        },
        {
          id: "outer",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 48,
            height: 48,
            tint: 10324440,
            depth: 0
          }
        },
        {
          id: "inner",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 32,
            height: 32,
            tint: 6603472,
            depth: 1
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 28,
            height: 22,
            tint: 3353930,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 15986920,
            depth: 3
          }
        },
        {
          id: "charge",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: 31
            }
          },
          children: [
            {
              id: "track",
              type: "sprite",
              alpha: 0.3,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 50,
                height: 4,
                tint: 15986920,
                depth: 4
              }
            },
            {
              id: "fill",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 2,
                height: 4,
                tint: 10324440,
                depth: 5
              }
            },
            {
              id: "ring",
              type: "sprite",
              alpha: 0.7,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 11,
                height: 11,
                tint: 10324440,
                depth: 6
              }
            }
          ]
        },
        {
          id: "beacon",
          type: "sprite",
          transform: {
            position: {
              x: 0,
              y: -28
            }
          },
          alpha: 0.78,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 12,
            height: 8,
            tint: 10324440,
            depth: 7
          }
        },
        {
          id: "cargo",
          type: "sprite",
          transform: {
            position: {
              x: 27,
              y: -12.666666666666666
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 16,
            height: 16,
            tint: 14267231,
            depth: 8
          }
        },
        {
          id: "task",
          type: "sprite",
          transform: {
            position: {
              x: -27,
              y: 12.666666666666666
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 6603472,
            depth: 9
          }
        },
        {
          id: "field",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 84,
            height: 84,
            tint: 14497319,
            depth: -3
          }
        },
        {
          id: "gear",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 42,
            height: 42,
            tint: 14267231,
            depth: 4
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "data-node"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.asset_fabricator",
    data: {
      id: "render.sandbox.asset_fabricator",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.32
            }
          },
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 52,
            height: 40,
            tint: 0,
            depth: -2
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.18,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 64,
            height: 64,
            tint: 14267231,
            depth: -1
          }
        },
        {
          id: "outer",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 50,
            height: 50,
            tint: 14267231,
            depth: 0
          }
        },
        {
          id: "inner",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 34,
            height: 34,
            tint: 15986920,
            depth: 1
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 30,
            height: 24,
            tint: 4865831,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 15986920,
            depth: 3
          }
        },
        {
          id: "charge",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: 32
            }
          },
          children: [
            {
              id: "track",
              type: "sprite",
              alpha: 0.3,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 52,
                height: 4,
                tint: 15986920,
                depth: 4
              }
            },
            {
              id: "fill",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 2,
                height: 4,
                tint: 14267231,
                depth: 5
              }
            },
            {
              id: "ring",
              type: "sprite",
              alpha: 0.7,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 11,
                height: 11,
                tint: 14267231,
                depth: 6
              }
            }
          ]
        },
        {
          id: "beacon",
          type: "sprite",
          transform: {
            position: {
              x: 0,
              y: -29
            }
          },
          alpha: 0.78,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 14,
            height: 8,
            tint: 14267231,
            depth: 7
          }
        },
        {
          id: "cargo",
          type: "sprite",
          transform: {
            position: {
              x: 28,
              y: -13.333333333333334
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 16,
            height: 16,
            tint: 14267231,
            depth: 8
          }
        },
        {
          id: "task",
          type: "sprite",
          transform: {
            position: {
              x: -28,
              y: 13.333333333333334
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 6603472,
            depth: 9
          }
        },
        {
          id: "field",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 86,
            height: 86,
            tint: 14497319,
            depth: -3
          }
        },
        {
          id: "gear",
          type: "sprite",
          alpha: 0.8,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 44,
            height: 44,
            tint: 14267231,
            depth: 4
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "asset-fabricator"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.interference_node",
    data: {
      id: "render.sandbox.interference_node",
      type: "container",
      children: [
        {
          id: "shadow",
          type: "sprite",
          transform: {
            position: {
              x: 5,
              y: 8
            },
            scale: {
              x: 1,
              y: 0.32
            }
          },
          alpha: 0.22,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 58,
            height: 46,
            tint: 0,
            depth: -2
          }
        },
        {
          id: "aura",
          type: "sprite",
          alpha: 0.26,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 70,
            height: 70,
            tint: 14497319,
            depth: -1
          }
        },
        {
          id: "outer",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 56,
            height: 56,
            tint: 14497319,
            depth: 0
          }
        },
        {
          id: "inner",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 40,
            height: 40,
            tint: 14267231,
            depth: 1
          }
        },
        {
          id: "body",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 30,
            height: 30,
            tint: 5120029,
            depth: 2
          }
        },
        {
          id: "core",
          type: "sprite",
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 11,
            height: 11,
            tint: 15986920,
            depth: 3
          }
        },
        {
          id: "charge",
          type: "container",
          transform: {
            position: {
              x: 0,
              y: 35
            }
          },
          children: [
            {
              id: "track",
              type: "sprite",
              alpha: 0.3,
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 58,
                height: 4,
                tint: 15986920,
                depth: 4
              }
            },
            {
              id: "fill",
              type: "sprite",
              props: {
                textureId: "asset.sandbox.entity_square",
                width: 2,
                height: 4,
                tint: 14497319,
                depth: 5
              }
            },
            {
              id: "ring",
              type: "sprite",
              alpha: 0.7,
              props: {
                textureId: "asset.sandbox.signal_ring",
                width: 11,
                height: 11,
                tint: 14497319,
                depth: 6
              }
            }
          ]
        },
        {
          id: "beacon",
          type: "sprite",
          transform: {
            position: {
              x: 0,
              y: -32
            }
          },
          alpha: 0.78,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 18,
            height: 8,
            tint: 14497319,
            depth: 7
          }
        },
        {
          id: "cargo",
          type: "sprite",
          transform: {
            position: {
              x: 31,
              y: -15.333333333333334
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 16,
            height: 16,
            tint: 14267231,
            depth: 8
          }
        },
        {
          id: "task",
          type: "sprite",
          transform: {
            position: {
              x: -31,
              y: 15.333333333333334
            }
          },
          alpha: 0,
          props: {
            textureId: "asset.sandbox.entity_square",
            width: 8,
            height: 8,
            tint: 6603472,
            depth: 9
          }
        },
        {
          id: "field",
          type: "sprite",
          alpha: 0.32,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 92,
            height: 92,
            tint: 14497319,
            depth: -3
          }
        },
        {
          id: "gear",
          type: "sprite",
          alpha: 0,
          props: {
            textureId: "asset.sandbox.signal_ring",
            width: 50,
            height: 50,
            tint: 14267231,
            depth: 4
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "interference-node"]
    }
  },
  {
    type: "render.object",
    id: "render.sandbox.signal_link",
    data: {
      id: "render.sandbox.signal_link",
      type: "sprite",
      alpha: 0.65,
      props: {
        textureId: "asset.sandbox.entity_square",
        width: 80,
        height: 4,
        tint: 6603472,
        depth: -10
      },
      tags: ["sandbox", "signal-outpost", "link"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.scout_swarm",
    data: {
      id: "renderRig.sandbox.scout_swarm",
      renderObjectId: "render.sandbox.entity",
      nodeAnimations: [
        {
          kind: "pulse",
          nodePath: "aura",
          scale: 0.16,
          speed: 2.4,
          alpha: {
            min: 0.18,
            max: 0.44
          }
        },
        {
          kind: "spin",
          nodePath: "body",
          speed: 1.3
        },
        {
          kind: "orbit",
          nodePath: "marker",
          radius: 3.5,
          speed: 2.1,
          phase: 0.5
        },
        {
          kind: "pulse",
          nodePath: "thruster/left",
          scale: 0.24,
          speed: 8,
          phase: 0.2,
          alpha: {
            min: 0.25,
            max: 0.9
          }
        },
        {
          kind: "pulse",
          nodePath: "thruster/right",
          scale: 0.24,
          speed: 8,
          phase: 1.1,
          alpha: {
            min: 0.25,
            max: 0.9
          }
        }
      ],
      tags: ["sandbox", "animated", "node-updates"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.command_core",
    data: {
      id: "renderRig.sandbox.command_core",
      renderObjectId: "render.sandbox.command_core",
      nodeAnimations: [
        {
          kind: "pulse",
          nodePath: "aura",
          scale: 0.08,
          speed: 2,
          alpha: {
            min: 0.2,
            max: 0.52
          }
        },
        {
          kind: "spin",
          nodePath: "outer",
          speed: 0.45
        },
        {
          kind: "spin",
          nodePath: "inner",
          speed: -0.8
        }
      ],
      tags: ["sandbox", "signal-outpost", "animated"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.relay_tower",
    data: {
      id: "renderRig.sandbox.relay_tower",
      renderObjectId: "render.sandbox.relay_tower",
      nodeAnimations: [
        {
          kind: "pulse",
          nodePath: "charge/ring",
          scale: 0.12,
          speed: 3.2
        },
        {
          kind: "pulse",
          nodePath: "beacon",
          scale: 0.18,
          speed: 4.4,
          alpha: {
            min: 0.35,
            max: 0.9
          }
        }
      ],
      tags: ["sandbox", "signal-outpost", "animated"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.scout",
    data: {
      id: "renderRig.sandbox.scout",
      renderObjectId: "render.sandbox.scout",
      nodeAnimations: [
        {
          kind: "pulse",
          nodePath: "cargo",
          scale: 0.15,
          speed: 5.2,
          alpha: {
            min: 0.2,
            max: 0.82
          }
        },
        {
          kind: "pulse",
          nodePath: "task",
          scale: 0.1,
          speed: 4.5
        }
      ],
      tags: ["sandbox", "signal-outpost", "animated"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.data_node",
    data: {
      id: "renderRig.sandbox.data_node",
      renderObjectId: "render.sandbox.data_node",
      nodeAnimations: [
        {
          kind: "pulse",
          nodePath: "core",
          scale: 0.08,
          speed: 2.8
        }
      ],
      tags: ["sandbox", "signal-outpost", "animated"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.asset_fabricator",
    data: {
      id: "renderRig.sandbox.asset_fabricator",
      renderObjectId: "render.sandbox.asset_fabricator",
      nodeAnimations: [
        {
          kind: "spin",
          nodePath: "gear",
          speed: 0.9
        }
      ],
      tags: ["sandbox", "signal-outpost", "animated"]
    }
  },
  {
    type: "sandbox.renderRig",
    id: "renderRig.sandbox.interference_node",
    data: {
      id: "renderRig.sandbox.interference_node",
      renderObjectId: "render.sandbox.interference_node",
      nodeAnimations: [
        {
          kind: "pulse",
          nodePath: "field",
          scale: 0.18,
          speed: 2.4,
          alpha: {
            min: 0.15,
            max: 0.5
          }
        },
        {
          kind: "spin",
          nodePath: "core",
          speed: -1.1
        }
      ],
      tags: ["sandbox", "signal-outpost", "animated"]
    }
  }
];
