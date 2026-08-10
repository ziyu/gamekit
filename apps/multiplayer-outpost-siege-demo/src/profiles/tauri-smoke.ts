import type { AppProfile } from "@gamekit/app-host";
import type { PlatformRuntime } from "@gamekit/platform-core";
import { createTauriPlatform } from "@gamekit/platform-tauri";
import { createOutpostVisualProfile, type OutpostVisualContext } from "./visual";

export type OutpostTauriSmokeContext = OutpostVisualContext;

export type CreateOutpostTauriSmokeProfileOptions = {
  platform?: PlatformRuntime | undefined;
};

export async function createOutpostTauriSmokeProfile(
  context: OutpostTauriSmokeContext,
  options: CreateOutpostTauriSmokeProfileOptions = {}
): Promise<AppProfile<OutpostTauriSmokeContext>> {
  const platform = options.platform ?? (await createTauriPlatform());
  if (platform.id !== "tauri") {
    throw new Error(
      `Outpost Tauri smoke profile requires a tauri platform, received ${platform.id}`
    );
  }

  return createOutpostVisualProfile(context, {
    profileId: "tauri-smoke",
    platform
  });
}
