import { describe, expect, it } from "vitest";
import { animatorAssetEntry, createAnimatorTestRegistry } from "../fixtures/animator-fixture";

describe("Animator data types", () => {
  it("validates marker order, graph state references, and binding fallback", () => {
    const registry = createAnimatorTestRegistry(false);
    const validation = registry.validatePack({
      id: "animator.invalid",
      version: "1.0.0",
      entries: [
        animatorAssetEntry(),
        {
          type: "animation.clip",
          id: "clip.invalid",
          data: {
            id: "clip.invalid",
            asset: { assetId: "asset.character", type: "spritesheet" },
            durationMs: 100,
            markers: [
              { id: "late", timeMs: 90 },
              { id: "early", timeMs: 20 }
            ]
          }
        },
        {
          type: "animator.graph",
          id: "graph.invalid",
          data: {
            id: "graph.invalid",
            parameters: [{ id: "flag", type: "boolean" }],
            layers: [
              {
                id: "base",
                initialState: "missing",
                states: [
                  { id: "idle", clip: "idle", speedParameter: "flag" },
                  { id: "run", clip: "idle", speedParameter: "unknown" }
                ],
                weight: 2
              }
            ],
            oneShots: [{ id: "broken", layer: "base", clip: "idle", speed: 0 }]
          }
        },
        {
          type: "animator.binding",
          id: "binding.invalid",
          data: {
            id: "binding.invalid",
            graph: { type: "animator.graph", id: "graph.invalid" },
            clips: { idle: { type: "animation.clip", id: "clip.invalid" } },
            fallbackClip: "missing",
            phaseMappings: [{ phase: "active", layer: "base", clip: "idle", speed: 0 }]
          }
        }
      ]
    });

    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "animator.clip_invalid_marker_time" }),
        expect.objectContaining({ code: "animator.graph_missing_initial_state" }),
        expect.objectContaining({ code: "animator.graph_invalid_layer_weight" }),
        expect.objectContaining({ code: "animator.graph_invalid_state_speed_parameter" }),
        expect.objectContaining({ code: "animator.graph_invalid_one_shot_speed" }),
        expect.objectContaining({ code: "animator.binding_invalid_phase_speed" }),
        expect.objectContaining({ code: "animator.binding_invalid_fallback" })
      ])
    );
  });
});
