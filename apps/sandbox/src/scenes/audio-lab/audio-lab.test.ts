import { describe, expect, it } from "vitest";
import { AUDIO_LAB_AUDIO_CONFIG, AUDIO_LAB_IDS, AUDIO_LAB_MUSIC_PROGRAMS } from "./audio-catalog";
import {
  AUDIO_LAB_ASSET_IDS,
  AUDIO_LAB_SAMPLE_RATE,
  createAudioLabWaveBytes
} from "./audio-assets";
import {
  AUDIO_LAB_DISTANCE_CALIBRATION_POINTS,
  AUDIO_LAB_DISTANCE_SPATIAL,
  AUDIO_LAB_FIELD_EXTENT_METERS,
  AUDIO_LAB_FIELD_SPATIAL,
  audioGainToDecibels,
  audioLabDistanceGain,
  audioLabSpatialMetrics,
  clampAudioLabSpatialPoint
} from "./spatial-calibration";

describe("Audio Lab scene content", () => {
  it("generates playable PCM WAV fixtures without network assets", () => {
    for (const assetId of Object.values(AUDIO_LAB_ASSET_IDS)) {
      const bytes = createAudioLabWaveBytes(assetId);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(text(bytes, 0, 4)).toBe("RIFF");
      expect(text(bytes, 8, 4)).toBe("WAVE");
      expect(text(bytes, 36, 4)).toBe("data");
      expect(view.getUint16(20, true)).toBe(1);
      expect(view.getUint16(22, true)).toBe(assetId.includes(".music.") ? 2 : 1);
      expect(view.getUint32(24, true)).toBe(AUDIO_LAB_SAMPLE_RATE);
      expect(view.getUint16(34, true)).toBe(16);
      expect(bytes.byteLength).toBeGreaterThan(44);
      expect(hasAudibleSample(view)).toBe(true);
    }
  });

  it("keeps every stereo music loop audible and quiet at its seam", () => {
    for (const assetId of Object.values(AUDIO_LAB_ASSET_IDS).filter((id) =>
      id.includes(".music.")
    )) {
      const bytes = createAudioLabWaveBytes(assetId);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(maxSample(view)).toBeGreaterThan(800);
      expect(Math.abs(view.getInt16(44, true))).toBeLessThan(64);
      expect(Math.abs(view.getInt16(view.byteLength - 2, true))).toBeLessThan(128);
    }
  });

  it("provides a near-continuous mono fixture for spatial movement", () => {
    const bytes = createAudioLabWaveBytes(AUDIO_LAB_ASSET_IDS.spatialField);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(22, true)).toBe(1);
    expect(audibleSampleRatio(view)).toBeGreaterThan(0.9);
  });

  it("keeps music, SFX and dialogue as distinct catalog domains", () => {
    expect(AUDIO_LAB_AUDIO_CONFIG.music?.map((entry) => entry.id)).toEqual([
      AUDIO_LAB_IDS.music.frontier,
      AUDIO_LAB_IDS.music.combat,
      AUDIO_LAB_IDS.music.nightDrive,
      AUDIO_LAB_IDS.music.quietRuins
    ]);
    expect(AUDIO_LAB_MUSIC_PROGRAMS).toHaveLength(4);
    expect(
      AUDIO_LAB_AUDIO_CONFIG.music?.every(
        (entry) => entry.loop && entry.defaultTransition?.type === "crossfade"
      )
    ).toBe(true);
    expect(AUDIO_LAB_AUDIO_CONFIG.sfx?.map((entry) => entry.id)).toEqual([
      AUDIO_LAB_IDS.sfx.weapon,
      AUDIO_LAB_IDS.sfx.impact,
      AUDIO_LAB_IDS.sfx.ui,
      AUDIO_LAB_IDS.sfx.beacon,
      AUDIO_LAB_IDS.sfx.spatialField
    ]);
    expect(AUDIO_LAB_AUDIO_CONFIG.dialogue?.map((entry) => entry.id)).toEqual([
      AUDIO_LAB_IDS.dialogue.scout,
      AUDIO_LAB_IDS.dialogue.operator
    ]);
    expect(
      AUDIO_LAB_AUDIO_CONFIG.sfx?.find((entry) => entry.id === AUDIO_LAB_IDS.sfx.ui)?.bus
    ).toBe("sfx/ui");
    expect(
      AUDIO_LAB_AUDIO_CONFIG.sfx?.find((entry) => entry.id === AUDIO_LAB_IDS.sfx.beacon)?.spatial
    ).toMatchObject(AUDIO_LAB_DISTANCE_SPATIAL);
    expect(
      AUDIO_LAB_AUDIO_CONFIG.sfx?.find((entry) => entry.id === AUDIO_LAB_IDS.sfx.spatialField)
        ?.spatial
    ).toMatchObject(AUDIO_LAB_FIELD_SPATIAL);
    expect(AUDIO_LAB_FIELD_SPATIAL.distanceCulling).toBe(false);
    expect(AUDIO_LAB_AUDIO_CONFIG.dialogue?.every((entry) => entry.duckingSnapshotId)).toBe(true);
  });

  it("publishes exact linear distance attenuation calibration values", () => {
    expect(AUDIO_LAB_DISTANCE_CALIBRATION_POINTS).toEqual([1, 4, 7, 10, 12]);
    expect(audioLabDistanceGain(0)).toBe(1);
    expect(audioLabDistanceGain(1)).toBe(1);
    expect(audioLabDistanceGain(4)).toBeCloseTo(8 / 11);
    expect(audioLabDistanceGain(7)).toBeCloseTo(5 / 11);
    expect(audioLabDistanceGain(10)).toBeCloseTo(2 / 11);
    expect(audioLabDistanceGain(12)).toBe(0);
    expect(audioGainToDecibels(audioLabDistanceGain(10))).toBeCloseTo(-14.807, 3);
    expect(audioGainToDecibels(0)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("matches the Phaser backend's two-dimensional pan and attenuation projection", () => {
    const listener = { x: 2, y: -1 };
    const front = audioLabSpatialMetrics(listener, { x: 2, y: 5 });
    const right = audioLabSpatialMetrics(listener, { x: 8, y: -1 });
    const rear = audioLabSpatialMetrics(listener, { x: 2, y: -7 });
    const left = audioLabSpatialMetrics(listener, { x: -4, y: -1 });

    expect(front).toMatchObject({ deltaX: 0, deltaY: 6, distanceMeters: 6, pan: 0 });
    expect(front.gain).toBeCloseTo(6 / 11);
    expect(front.bearingDegrees).toBe(0);
    expect(right).toMatchObject({ distanceMeters: 6, pan: 0.5, bearingDegrees: 90 });
    expect(rear).toMatchObject({ distanceMeters: 6, pan: 0, bearingDegrees: -180 });
    expect(left).toMatchObject({ distanceMeters: 6, pan: -0.5, bearingDegrees: -90 });
    expect(clampAudioLabSpatialPoint({ x: 99, y: -99 })).toEqual({
      x: AUDIO_LAB_FIELD_EXTENT_METERS,
      y: -AUDIO_LAB_FIELD_EXTENT_METERS
    });
  });
});

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function hasAudibleSample(view: DataView): boolean {
  for (let offset = 44; offset < view.byteLength; offset += 2) {
    if (Math.abs(view.getInt16(offset, true)) > 24) {
      return true;
    }
  }
  return false;
}

function maxSample(view: DataView): number {
  let peak = 0;
  for (let offset = 44; offset < view.byteLength; offset += 2) {
    peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
  }
  return peak;
}

function audibleSampleRatio(view: DataView): number {
  let audible = 0;
  let samples = 0;
  for (let offset = 44; offset < view.byteLength; offset += 2) {
    samples += 1;
    if (Math.abs(view.getInt16(offset, true)) > 24) {
      audible += 1;
    }
  }
  return audible / samples;
}
