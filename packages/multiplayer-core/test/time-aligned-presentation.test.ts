import { describe, expect, it } from "vitest";
import {
  createMultiplayerTimeAlignedPresentationTransition,
  definePredictionScalarStateField
} from "../src";

type LifecycleRecord = {
  id: string;
  version: string;
  originTime: number;
  originX: number;
  velocity: number;
  finished?: boolean | undefined;
};

type LifecycleSample = {
  x: number;
  active: boolean;
};

describe("Multiplayer time-aligned presentation transition", () => {
  it("adopts matching authority data at the predicted lifecycle age", () => {
    const transition = createTransition("relative-origin");
    const predicted = record("predicted", 0);
    const authoritative = record("authority", 4);

    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 10,
        elapsedMs: 100
      })
    ).toEqual({ x: 100, active: true });
    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 12,
        elapsedMs: 200
      })
    ).toEqual({ x: 120, active: true });
    expect(transition.diagnostics()).toMatchObject({
      reconciliations: 1,
      confirmed: 1,
      corrected: 0,
      relativeAlignments: 1,
      smoothedCorrections: 0,
      lastAuthorityTimeOffset: 4
    });
  });

  it("keeps absolute authority sampling available for snapshot-style lifecycles", () => {
    const transition = createTransition("absolute");
    const predicted = record("predicted", 0);
    const authoritative = record("authority", 4);

    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 10,
        elapsedMs: 100
      })
    ).toEqual({ x: 100, active: true });
    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 12,
        elapsedMs: 200
      })
    ).toEqual({ x: 80, active: true });
    expect(transition.diagnostics()).toMatchObject({
      corrected: 1,
      absoluteAlignments: 1,
      smoothedCorrections: 1,
      completedCorrections: 1,
      lastOriginTimeOffset: 4,
      lastAuthorityTimeOffset: 0
    });
  });

  it("smooths only residual state divergence after relative time alignment", () => {
    const transition = createTransition("relative-origin");
    const predicted = record("predicted", 0);
    const authoritative = record("authority", 4, { originX: 2 });

    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 10,
        elapsedMs: 100
      })
    ).toEqual({ x: 100, active: true });
    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 12,
        elapsedMs: 200
      })
    ).toEqual({ x: 122, active: true });
    expect(transition.diagnostics()).toMatchObject({
      corrected: 1,
      relativeAlignments: 1,
      smoothedCorrections: 1,
      completedCorrections: 1,
      lastAuthorityTimeOffset: 4
    });
  });

  it("can retain a provisional lifecycle fact until authority catches up", () => {
    const transition = createTransition("relative-origin");
    const predicted = record("predicted", 0, { finished: true });
    const authoritative = record("authority", 4);

    expect(
      transition.sample({
        predicted,
        authoritative,
        presentationTime: 10,
        elapsedMs: 100
      })
    ).toEqual({ x: 100, active: false });
    expect(transition.diagnostics()).toMatchObject({
      heldPredictions: 1,
      activeCorrections: 0
    });
  });

  it("bounds lifecycle entries and releases retained state on dispose", () => {
    const transition = createTransition("relative-origin", 1);

    for (const id of ["lifecycle-1", "lifecycle-2"]) {
      transition.sample({
        predicted: record(`predicted-${id}`, 0, { id }),
        authoritative: record(`authority-${id}`, 2, { id }),
        presentationTime: 5,
        elapsedMs: 100
      });
    }

    expect(transition.diagnostics()).toMatchObject({ entries: 1, evictedEntries: 1 });
    transition.dispose();
    expect(() => transition.diagnostics()).toThrow(/disposed/);
  });
});

function createTransition(alignment: "absolute" | "relative-origin", maxEntries?: number) {
  const position = definePredictionScalarStateField<LifecycleSample>({
    read(sample) {
      return sample.x;
    },
    write(sample, x) {
      sample.x = x;
    }
  });
  return createMultiplayerTimeAlignedPresentationTransition<
    LifecycleRecord,
    LifecycleRecord,
    LifecycleSample,
    { trajectoryMatches: boolean }
  >({
    key(_predicted, authoritative) {
      return authoritative.id;
    },
    version(predicted, authoritative) {
      return `${predicted.version}:${authoritative.version}`;
    },
    reconcile(predicted, authoritative) {
      const trajectoryMatches =
        predicted.originX === authoritative.originX &&
        predicted.velocity === authoritative.velocity;
      const timelineMatches =
        alignment === "relative-origin" || predicted.originTime === authoritative.originTime;
      return {
        status: trajectoryMatches && timelineMatches ? "confirmed" : "corrected",
        result: { trajectoryMatches },
        alignment:
          alignment === "absolute"
            ? {
                mode: "absolute",
                predictedOriginTime: predicted.originTime,
                authorityOriginTime: authoritative.originTime
              }
            : {
                mode: "relative-origin",
                predictedOriginTime: predicted.originTime,
                authorityOriginTime: authoritative.originTime
              },
        holdPrediction: predicted.finished === true && authoritative.finished !== true
      };
    },
    samplePredicted: sampleRecord,
    sampleAuthority: sampleRecord,
    cloneSample(sample) {
      return { ...sample };
    },
    presentation: {
      fields: [position],
      correction: {
        measure: position,
        smooth: [position],
        durationMs: 100
      }
    },
    isActive(sample) {
      return sample.active;
    },
    maxEntries
  });
}

function sampleRecord(record: LifecycleRecord, presentationTime: number): LifecycleSample {
  return {
    x: record.originX + (presentationTime - record.originTime) * record.velocity,
    active: record.finished !== true
  };
}

function record(
  version: string,
  originTime: number,
  overrides: Partial<LifecycleRecord> = {}
): LifecycleRecord {
  return {
    id: "lifecycle-1",
    version,
    originTime,
    originX: 0,
    velocity: 10,
    ...overrides
  };
}
