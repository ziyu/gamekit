import type {
  MultiplayerProjectileLabConfigPatch,
  MultiplayerProjectileLabScenarioConfig
} from "./types";

const BASE_NETWORK = {
  latencyMs: 240,
  jitterMs: 0,
  reorderMs: 0,
  duplicateEvery: 0,
  partitioned: false
} as const;

const BASE_SCENARIO: MultiplayerProjectileLabScenarioConfig = {
  id: "baseline-ray",
  label: "Baseline ray",
  description: "Equal worlds, moderate RTT, one swept ray. The complete path must confirm.",
  collisionMode: "ray-sweep",
  projectileRadius: 0,
  lifetimeTicks: 180,
  firePosition: { x: 8, y: 0 },
  fireVelocity: { x: 48, y: 0 },
  ownerWallX: 70,
  authorityWallX: 70,
  ownerWallEnabled: true,
  authorityWallEnabled: true,
  burstCount: 1,
  burstIntervalTicks: 2,
  expected: { reconciliation: "confirmed", finishReason: "impact" },
  network: { ...BASE_NETWORK }
};

export const MULTIPLAYER_PROJECTILE_LAB_PRESETS: readonly MultiplayerProjectileLabScenarioConfig[] =
  [
    BASE_SCENARIO,
    {
      ...BASE_SCENARIO,
      id: "high-latency",
      label: "800 ms RTT",
      description:
        "Owner prediction must finish locally while authority and remote remain delayed.",
      network: { ...BASE_NETWORK, latencyMs: 800 }
    },
    {
      ...BASE_SCENARIO,
      id: "shape-sweep",
      label: "Shape sweep",
      description:
        "A radius-bearing projectile must stop its center before the wall contact plane.",
      collisionMode: "shape-sweep",
      projectileRadius: 1.25
    },
    {
      ...BASE_SCENARIO,
      id: "authority-early",
      label: "Authority wall −12",
      description: "Authority hits earlier than the owner and produces one bounded correction.",
      authorityWallX: 58,
      expected: { reconciliation: "corrected", finishReason: "impact" },
      network: { ...BASE_NETWORK, latencyMs: 320 }
    },
    {
      ...BASE_SCENARIO,
      id: "authority-late",
      label: "Authority wall +12",
      description: "Authority hits later than the owner and corrects in the opposite direction.",
      authorityWallX: 82,
      expected: { reconciliation: "corrected", finishReason: "impact" },
      network: { ...BASE_NETWORK, latencyMs: 320 }
    },
    {
      ...BASE_SCENARIO,
      id: "burst-interleave",
      label: "12-shot burst",
      description:
        "Interleaved fire validates correlation, bounded history, and concurrent sweeps.",
      burstCount: 12,
      burstIntervalTicks: 2,
      network: { ...BASE_NETWORK, latencyMs: 180 }
    },
    {
      ...BASE_SCENARIO,
      id: "fault-matrix",
      label: "Jitter / reorder / dup",
      description: "Reliable messages arrive late, out of order, and duplicated without diverging.",
      burstCount: 8,
      burstIntervalTicks: 1,
      network: {
        ...BASE_NETWORK,
        latencyMs: 360,
        jitterMs: 140,
        reorderMs: 220,
        duplicateEvery: 2
      }
    },
    {
      ...BASE_SCENARIO,
      id: "partition-recovery",
      label: "Partition recovery",
      description: "Packets are held, not dropped, then released and converged deterministically.",
      burstCount: 4,
      burstIntervalTicks: 2,
      releasePartitionAfterMs: 900,
      network: { ...BASE_NETWORK, latencyMs: 180, partitioned: true }
    },
    {
      ...BASE_SCENARIO,
      id: "open-range-expiry",
      label: "Open range expiry",
      description: "With both blockers disabled, every peer must reproduce the lifetime expiry.",
      lifetimeTicks: 72,
      fireVelocity: { x: 70, y: 0 },
      ownerWallEnabled: false,
      authorityWallEnabled: false,
      expected: { reconciliation: "confirmed", finishReason: "expired" }
    },
    {
      ...BASE_SCENARIO,
      id: "tunneling-proof",
      label: "300 u/s sweep",
      description: "A projectile crossing several units per tick must still stop at the blocker.",
      collisionMode: "shape-sweep",
      projectileRadius: 0.75,
      fireVelocity: { x: 300, y: 0 },
      network: { ...BASE_NETWORK, latencyMs: 300 }
    },
    {
      ...BASE_SCENARIO,
      id: "diagonal-impact",
      label: "Diagonal impact",
      description: "The 2D sweep path and remote reconstruction preserve both vector components.",
      collisionMode: "shape-sweep",
      projectileRadius: 0.6,
      firePosition: { x: 8, y: -8 },
      fireVelocity: { x: 64, y: 10 },
      network: { ...BASE_NETWORK, latencyMs: 260, jitterMs: 60 }
    }
  ];

export function getMultiplayerProjectileLabPreset(
  id: string
): MultiplayerProjectileLabScenarioConfig | undefined {
  const preset = MULTIPLAYER_PROJECTILE_LAB_PRESETS.find((entry) => entry.id === id);
  return preset === undefined ? undefined : cloneMultiplayerProjectileLabConfig(preset);
}

export function createDefaultMultiplayerProjectileLabConfig(): MultiplayerProjectileLabScenarioConfig {
  return cloneMultiplayerProjectileLabConfig(BASE_SCENARIO);
}

export function patchMultiplayerProjectileLabConfig(
  current: MultiplayerProjectileLabScenarioConfig,
  patch: MultiplayerProjectileLabConfigPatch
): MultiplayerProjectileLabScenarioConfig {
  return normalizeMultiplayerProjectileLabConfig({
    ...current,
    ...patch,
    firePosition: patch.firePosition ?? current.firePosition,
    fireVelocity: patch.fireVelocity ?? current.fireVelocity,
    expected: current.expected,
    network: { ...current.network, ...patch.network },
    id: patch.id ?? "custom",
    label: patch.label ?? (patch.id === undefined ? "Custom matrix" : current.label),
    description:
      patch.description ??
      (patch.id === undefined
        ? "User-authored parameters running through the same real prediction pipeline."
        : current.description)
  });
}

export function cloneMultiplayerProjectileLabConfig(
  config: MultiplayerProjectileLabScenarioConfig
): MultiplayerProjectileLabScenarioConfig {
  return {
    ...config,
    firePosition: { ...config.firePosition },
    fireVelocity: { ...config.fireVelocity },
    expected: { ...config.expected },
    network: { ...config.network }
  };
}

function normalizeMultiplayerProjectileLabConfig(
  config: MultiplayerProjectileLabScenarioConfig
): MultiplayerProjectileLabScenarioConfig {
  return {
    ...cloneMultiplayerProjectileLabConfig(config),
    projectileRadius: clamp(config.projectileRadius, 0, 4),
    lifetimeTicks: integer(config.lifetimeTicks, 12, 600),
    firePosition: {
      x: clamp(config.firePosition.x, 0, 95),
      y: clamp(config.firePosition.y, -18, 18)
    },
    fireVelocity: {
      x: clamp(config.fireVelocity.x, 1, 400),
      y: clamp(config.fireVelocity.y, -100, 100)
    },
    ownerWallX: clamp(config.ownerWallX, 20, 98),
    authorityWallX: clamp(config.authorityWallX, 20, 98),
    burstCount: integer(config.burstCount, 1, 24),
    burstIntervalTicks: integer(config.burstIntervalTicks, 1, 30),
    network: {
      latencyMs: integer(config.network.latencyMs, 0, 1_500),
      jitterMs: integer(config.network.jitterMs, 0, 600),
      reorderMs: integer(config.network.reorderMs, 0, 600),
      duplicateEvery: integer(config.network.duplicateEvery, 0, 10),
      partitioned: config.network.partitioned
    }
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function integer(value: number, minimum: number, maximum: number): number {
  return Math.round(clamp(value, minimum, maximum));
}
