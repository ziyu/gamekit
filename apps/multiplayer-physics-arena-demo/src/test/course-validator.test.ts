import { describe, expect, it } from "vitest";

import {
  validateArenaCompiledContent,
  validateArenaNavigationArtifacts
} from "../content/course-validator";
import { createArenaDataRegistry, compileArenaContent } from "../content/registry";

describe("Knockout Arena course validation", () => {
  it("accepts all compiled spatial, projection and convergence contracts", () => {
    const report = validateArenaCompiledContent(compileArenaContent(createArenaDataRegistry()));

    expect(report).toMatchObject({ valid: true, courseCount: 3, issues: [] });
    expect(report.probeCount).toBeGreaterThan(30);
  });

  it("rejects blocked spawns, broken route order and out-of-bounds hazard travel deterministically", () => {
    const content = compileArenaContent(createArenaDataRegistry());
    content.stages[0]!.spawnSet.points[0]!.position.y = -0.4;
    content.stages[0]!.course.volumes.find(({ kind }) => kind === "finish")!.routeOrder = 8;
    content.stages[0]!.courseProjection.hazardSchedules.find(
      ({ kind }) => kind === "moving-platform"
    )!.travel = 40;

    const report = validateArenaCompiledContent(content);
    expect(report.valid).toBe(false);
    expect(report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "arena.validation.spawn_clearance",
        "arena.validation.route",
        "arena.validation.hazard_bounds"
      ])
    );
    expect(report.issues).toEqual(
      [...report.issues].sort((left, right) =>
        `${left.stageId}:${left.code}:${left.sourceId}`.localeCompare(
          `${right.stageId}:${right.code}:${right.sourceId}`
        )
      )
    );
  });

  it("bakes real Recast artifacts and reaches every required stage target", async () => {
    const report = await validateArenaNavigationArtifacts(
      compileArenaContent(createArenaDataRegistry())
    );

    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.artifacts.map(({ checkedRoutes }) => checkedRoutes)).toEqual([24, 6, 3]);
    for (const artifact of report.artifacts) {
      expect(artifact).toMatchObject({
        sourceVersion: expect.any(String),
        polygonCount: expect.any(Number),
        debugTriangleCount: expect.any(Number),
        byteLength: expect.any(Number)
      });
      expect(artifact.polygonCount).toBeGreaterThan(0);
      expect(artifact.debugTriangleCount).toBeGreaterThan(0);
      expect(artifact.byteLength).toBeGreaterThan(0);
    }
  });
});
