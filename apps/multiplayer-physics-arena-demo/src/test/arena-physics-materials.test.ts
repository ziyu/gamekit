import { describe, expect, it } from "vitest";

import { ARENA_COMPILED_CONTENT } from "../content/default-content";
import { createArenaPhysicsMaterialDefinitions } from "../shared/arena-physics-materials";

describe("Knockout Arena Physics material composition", () => {
  it("includes every authored prop material through one shared scene contract", () => {
    const materials = createArenaPhysicsMaterialDefinitions({ content: ARENA_COMPILED_CONTENT });
    const ids = materials.map(({ id }) => id);
    const propCount = ARENA_COMPILED_CONTENT.stages.reduce(
      (total, stage) => total + stage.course.props.length,
      0
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith("arena.prop-material."))).toHaveLength(propCount);
    expect(ids).toContain("arena.prop-material.circuit.prop.ball-center");
  });

  it("rejects duplicate additional material ids", () => {
    expect(() =>
      createArenaPhysicsMaterialDefinitions({
        content: ARENA_COMPILED_CONTENT,
        additional: [{ id: "actor" }]
      })
    ).toThrow("Arena physics material requires a unique id: actor");
  });
});
