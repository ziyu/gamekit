import type { CreateGameAudioOptions } from "../../src";

export function audioAsset(id: string) {
  return { type: "audio" as const, assetId: `audio.${id}` };
}

export function baseCatalog(): Omit<CreateGameAudioOptions, "backend"> {
  return {
    music: [
      {
        id: "music.explore",
        source: {
          kind: "asset",
          clips: [{ id: "base", asset: audioAsset("music.explore"), loop: true }]
        },
        stems: [
          {
            id: "danger",
            source: {
              kind: "asset",
              clips: [{ id: "danger", asset: audioAsset("music.danger"), loop: true }]
            },
            intensity: { min: 0.25, max: 0.75 }
          }
        ]
      },
      {
        id: "music.combat",
        source: {
          kind: "asset",
          clips: [{ id: "base", asset: audioAsset("music.combat"), loop: true }]
        },
        defaultTransition: { type: "crossfade", durationMs: 400 }
      }
    ],
    sfx: [
      {
        id: "sfx.weapon",
        concurrency: ["weapon"],
        layers: [
          {
            id: "body",
            selection: "sequence",
            clips: [
              { id: "shot-a", asset: audioAsset("shot-a") },
              { id: "shot-b", asset: audioAsset("shot-b") }
            ]
          },
          {
            id: "mechanical",
            clips: [{ id: "mechanical", asset: audioAsset("mechanical"), volume: 0.5 }]
          }
        ]
      },
      {
        id: "sfx.spatial",
        spatial: { maxDistance: 10, distanceCulling: true },
        layers: [{ id: "main", clips: [{ id: "spatial", asset: audioAsset("spatial") }] }]
      }
    ],
    dialogue: [
      {
        id: "dialogue.alpha",
        speakerId: "speaker.alpha",
        subtitleKey: "dialogue.alpha.subtitle",
        markers: [{ id: "gesture", positionMs: 50 }],
        source: {
          kind: "asset",
          clips: [{ id: "alpha", asset: audioAsset("dialogue.alpha") }]
        },
        duckingSnapshotId: "dialogue-duck"
      },
      {
        id: "dialogue.beta",
        speakerId: "speaker.beta",
        priority: 10,
        source: {
          kind: "asset",
          clips: [{ id: "beta", asset: audioAsset("dialogue.beta") }]
        }
      }
    ],
    concurrency: [
      {
        id: "weapon",
        maxInstances: 2,
        resolution: "stop-lowest-priority"
      }
    ],
    mixSnapshots: [
      {
        id: "dialogue-duck",
        priority: 10,
        buses: [{ busId: "music", volume: 0.35 }]
      }
    ]
  };
}
