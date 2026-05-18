import type { DevToolsUiSnapshot } from "@gamekit/devtools";
import type { DevToolsUiBridge, DevToolsUiBridgeOptions } from "./types";

const DEFAULT_LAUNCHER_PANEL_ID = "gamekit.devtools.launcher";
const DEFAULT_SHELL_PANEL_ID = "gamekit.devtools.shell";

export function createDevToolsUiBridge(options: DevToolsUiBridgeOptions): DevToolsUiBridge {
  const launcherPanelId = options.launcher?.panelId ?? DEFAULT_LAUNCHER_PANEL_ID;
  const shellPanelId =
    options.shell?.panelId ?? options.launcher?.shellPanelId ?? DEFAULT_SHELL_PANEL_ID;
  const shellTitle = options.shell?.title ?? "GameKit DevTools";
  const launcherLabel = options.launcher?.label ?? "DevTools";

  return {
    launcherPanelId,
    shellPanelId,
    openShell() {
      ensureShellPanel(options, shellPanelId, shellTitle);
      options.ui.open(shellPanelId);
    },
    closeShell() {
      options.ui.close(shellPanelId);
    },
    toggleShell() {
      ensureShellPanel(options, shellPanelId, shellTitle);
      options.ui.toggle(shellPanelId);
    },
    focusShell() {
      options.ui.setFocus({
        scope: "devtools",
        target: shellPanelId,
        reason: "devtools.focus"
      });
    },
    snapshot(): DevToolsUiSnapshot {
      const uiSnapshot = options.ui.snapshot();
      const shellPanel = uiSnapshot.openPanels.find((panel) => panel.id === shellPanelId);
      return {
        launcher: {
          enabled: options.launcher?.enabled !== false,
          panelId: launcherPanelId,
          shellPanelId,
          label: launcherLabel,
          position: options.launcher?.position ?? "bottom-right",
          hotkeys: options.launcher?.hotkeys ?? ["F12"]
        },
        shell: {
          enabled: options.shell?.enabled !== false,
          panelId: shellPanelId,
          title: shellTitle,
          open: shellPanel !== undefined,
          activePanelId: options.shell?.defaultPanelId,
          refreshIntervalMs: options.shell?.refreshIntervalMs
        }
      };
    }
  };
}

function ensureShellPanel(
  options: DevToolsUiBridgeOptions,
  shellPanelId: string,
  shellTitle: string
): void {
  if (options.ui.panel(shellPanelId)) {
    return;
  }

  options.ui.registerPanel({
    id: shellPanelId,
    title: shellTitle,
    kind: "devtools",
    tags: ["gamekit", "devtools", "shell"],
    defaultProps: options.shell
  });
}
