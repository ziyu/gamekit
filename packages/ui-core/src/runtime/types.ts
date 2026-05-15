export type UiPanelId = string;
export type UiWindowId = string;
export type UiCommandType = string;

export type UiPanelKind = "panel" | "window" | "modal" | "overlay" | "hud" | "devtools";

export type UiLayer = "base" | "hud" | "panel" | "modal" | "overlay" | "devtools";

export type UiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UiPanelDefinition<TProps = unknown> = {
  id: UiPanelId;
  title: string;
  kind: UiPanelKind;
  tags?: string[] | undefined;
  defaultProps?: TProps | undefined;
};

export type UiWindowDefinition<TProps = unknown> = UiPanelDefinition<TProps> & {
  kind: "window" | "modal" | "overlay" | "devtools";
  defaultSize?: { width: number; height: number } | undefined;
  defaultPosition?: { x: number; y: number } | undefined;
  closable?: boolean | undefined;
  movable?: boolean | undefined;
  resizable?: boolean | undefined;
  minimizable?: boolean | undefined;
  singleton?: boolean | undefined;
  layer?: UiLayer | undefined;
};

export type UiCommand = {
  type: UiCommandType;
  target?: UiPanelId | undefined;
  payload?: unknown;
  source?: string | undefined;
};

export type UiFocusScope = "none" | "game" | "ui" | "modal" | "text-input" | "devtools";

export type UiFocusState = {
  scope: UiFocusScope;
  target?: string | undefined;
  reason?: string | undefined;
};

export type UiOpenPanel = {
  id: UiPanelId;
  title: string;
  kind: UiPanelKind;
  layer: UiLayer;
  props?: unknown;
  rect?: UiRect | undefined;
  focused: boolean;
};

export type UiRuntimeSnapshot = {
  panels: Array<UiPanelDefinition>;
  openPanels: UiOpenPanel[];
  focus: UiFocusState;
  commands: UiCommand[];
  diagnostics: UiDiagnosticEvent[];
};

export type UiDiagnosticSeverity = "info" | "warning" | "error";

export type UiDiagnosticEvent = {
  type: string;
  severity: UiDiagnosticSeverity;
  source?: string | undefined;
  payload: Record<string, unknown>;
};

export type UiRuntimeSubscriber = () => void;

export type UiRuntime = {
  registerPanel<TProps>(definition: UiPanelDefinition<TProps>): void;
  unregisterPanel(id: UiPanelId): void;
  panel<TProps = unknown>(id: UiPanelId): UiPanelDefinition<TProps> | undefined;
  panels(): UiPanelDefinition[];
  open(id: UiPanelId, props?: unknown): void;
  close(id: UiPanelId): void;
  toggle(id: UiPanelId, props?: unknown): void;
  openPanels(): UiOpenPanel[];
  dispatch(command: UiCommand): void;
  commands(): UiCommand[];
  focus(): UiFocusState;
  setFocus(focus: UiFocusState): void;
  emitDiagnostic(event: UiDiagnosticEvent): void;
  diagnostics(): UiDiagnosticEvent[];
  snapshot(): UiRuntimeSnapshot;
  subscribe(subscriber: UiRuntimeSubscriber): () => void;
  clear(): void;
};
