import type { DevToolsRuntime } from "@gamekit/devtools";
import type { UiRuntime } from "@gamekit/ui-core";
import { createDevToolsUiBridge } from "../runtime";

export type DevToolsLauncherProps = {
  runtime: DevToolsRuntime;
  uiRuntime: UiRuntime;
  label?: string | undefined;
  shellPanelId?: string | undefined;
};

export function DevToolsLauncher({
  runtime,
  uiRuntime,
  label,
  shellPanelId
}: DevToolsLauncherProps) {
  const bridge = createDevToolsUiBridge({
    devtools: runtime,
    ui: uiRuntime,
    launcher: { label, shellPanelId }
  });
  const snapshot = bridge.snapshot();

  if (!snapshot.launcher.enabled) {
    return null;
  }

  return (
    <button
      aria-label="Open GameKit DevTools"
      className="gamekit-devtools-launcher"
      title="Open GameKit DevTools"
      type="button"
      data-devtools-launcher={snapshot.launcher.panelId}
      data-devtools-position={snapshot.launcher.position}
      onClick={(event) => {
        if (event.detail === 0) {
          bridge.toggleShell();
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        bridge.toggleShell();
      }}
    >
      {snapshot.launcher.label}
    </button>
  );
}
