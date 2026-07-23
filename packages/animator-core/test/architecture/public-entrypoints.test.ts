import { describe, expect, it } from "vitest";
import * as animatorRoot from "../../src";
import * as animatorTesting from "../../src/testing";

describe("Animator package entrypoints", () => {
  it("keeps test fixtures out of the gameplay root", () => {
    expect(animatorRoot).not.toHaveProperty("createMemoryAnimationPlaybackAdapter");
    expect(animatorRoot).not.toHaveProperty("runAnimatorRuntimeConformance");
    expect(animatorTesting).toHaveProperty("createMemoryAnimationPlaybackAdapter");
    expect(animatorTesting).toHaveProperty("runAnimatorRuntimeConformance");
  });
});
