import type { AssetLoadState, AssetManager } from "./types";

export type LoadAssetGroupWithRetryOptions = {
  maxAttempts?: number | undefined;
  onAttempt?(result: AssetGroupLoadAttempt): void;
  onAttemptError?(error: unknown, result: AssetGroupLoadAttempt): void;
};

export type AssetGroupLoadAttempt = {
  group: string;
  attempt: number;
  states: readonly Readonly<AssetLoadState>[];
};

export type AssetGroupLoadResult = AssetGroupLoadAttempt & {
  succeeded: boolean;
};

export async function loadAssetGroupWithRetry(
  manager: AssetManager,
  group: string,
  options: LoadAssetGroupWithRetryOptions = {}
): Promise<AssetGroupLoadResult> {
  const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
  let states: AssetLoadState[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    states = await manager.loadGroup(group);
    const result = createAttempt(group, attempt, states);
    notifyAttempt(options, result);
    if (states.length === 0) {
      return { ...result, succeeded: false };
    }
    if (states.every((state) => state.status === "loaded")) {
      return { ...result, succeeded: true };
    }
  }

  return { ...createAttempt(group, maxAttempts, states), succeeded: false };
}

function createAttempt(
  group: string,
  attempt: number,
  states: AssetLoadState[]
): AssetGroupLoadAttempt {
  return Object.freeze({
    group,
    attempt,
    states: Object.freeze(states.map((state) => Object.freeze({ ...state })))
  });
}

function notifyAttempt(
  options: LoadAssetGroupWithRetryOptions,
  result: AssetGroupLoadAttempt
): void {
  if (!options.onAttempt) {
    return;
  }
  try {
    options.onAttempt(result);
  } catch (error) {
    try {
      options.onAttemptError?.(error, result);
    } catch {
      // Progress/diagnostic observers must not change the asset loading result.
    }
  }
}

function normalizeMaxAttempts(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 1 : Math.max(1, Math.floor(value));
}
