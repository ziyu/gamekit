import { describe, expect, it } from "vitest";
import {
  createMemoryAudioBackend,
  createNullAudioBackend,
  runAudioBackendConformance
} from "../../src/testing";

describe("AudioBackend conformance", () => {
  it.each([
    ["memory", createMemoryAudioBackend],
    ["null", createNullAudioBackend]
  ])("validates the %s backend", async (_name, createBackend) => {
    const report = await runAudioBackendConformance({ createBackend });
    expect(report.checks).toEqual([
      "unlock",
      "listener",
      "emitter",
      "start",
      "pause",
      "resume",
      "seek",
      "update",
      "bus",
      "stop"
    ]);
    expect(report.stoppedPlaybackInstances).toBe(1);
  });
});
