import type {
  DevToolsLauncherOptions,
  DevToolsRuntime,
  DevToolsShellOptions,
  DevToolsUiSnapshot
} from "@gamekit/devtools";
import type { UiRuntime } from "@gamekit/ui-core";

export type DevToolsUiBridgeOptions = {
  devtools: DevToolsRuntime;
  ui: UiRuntime;
  launcher?: DevToolsLauncherOptions | undefined;
  shell?: DevToolsShellOptions | undefined;
};

export type DevToolsUiBridge = {
  launcherPanelId: string;
  shellPanelId: string;
  openShell(): void;
  closeShell(): void;
  toggleShell(): void;
  focusShell(): void;
  snapshot(): DevToolsUiSnapshot;
};
