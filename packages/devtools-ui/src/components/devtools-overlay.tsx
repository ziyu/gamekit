import { useMemo, useSyncExternalStore } from "react";
import type { DevToolsRuntime } from "@gamekit/devtools";
import type { UiRuntime } from "@gamekit/ui-core";
import { DevToolsLauncher } from "./devtools-launcher";
import { DevToolsShell } from "./devtools-shell";

export type DevToolsOverlayProps = {
  runtime: DevToolsRuntime;
  uiRuntime: UiRuntime;
};

export function DevToolsOverlay({ runtime, uiRuntime }: DevToolsOverlayProps) {
  const uiSnapshot = useSyncExternalStore(
    uiRuntime.subscribe,
    uiRuntime.snapshot,
    uiRuntime.snapshot
  );
  const shellPanel = useMemo(
    () => uiSnapshot.openPanels.find((panel) => panel.id === "gamekit.devtools.shell"),
    [uiSnapshot.openPanels]
  );

  return (
    <div className="gamekit-devtools-overlay">
      <DevToolsLauncher runtime={runtime} uiRuntime={uiRuntime} />
      {shellPanel ? <DevToolsShell runtime={runtime} uiRuntime={uiRuntime} /> : null}
    </div>
  );
}
