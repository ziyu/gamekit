export type DevToolsSeverity = "debug" | "info" | "warning" | "error";

export type DevToolsDataSourceKind =
  | "host"
  | "platform"
  | "driver"
  | "runtime"
  | "event-bus"
  | "world"
  | "data"
  | "asset"
  | "renderer"
  | "input"
  | "camera"
  | "tca"
  | "gas"
  | "save"
  | "ui"
  | "custom";

export type DevToolsTraceKind =
  | "input"
  | "event"
  | "tca"
  | "gas"
  | "world"
  | "renderer"
  | "asset"
  | "camera"
  | "save"
  | "runtime"
  | "host"
  | "ui"
  | "custom";

export type DevToolsTraceEntry = {
  id: string;
  time: number;
  kind: DevToolsTraceKind;
  label: string;
  source: string;
  severity?: DevToolsSeverity | undefined;
  status?: string | undefined;
  correlationId?: string | undefined;
  parentId?: string | undefined;
  entityId?: string | number | undefined;
  actorId?: string | undefined;
  dataKey?: { type: string; id: string } | undefined;
  payload?: unknown;
};

export type DevToolsTraceInput = Omit<DevToolsTraceEntry, "id" | "time"> &
  Partial<Pick<DevToolsTraceEntry, "id" | "time">>;

export type DevToolsDiagnosticEvent = {
  id: string;
  type: string;
  severity: Exclude<DevToolsSeverity, "debug">;
  time: number;
  source: string;
  phase?: string | undefined;
  code?: string | undefined;
  message: string;
  relatedTraceId?: string | undefined;
  dataSourceId?: string | undefined;
  panelId?: string | undefined;
  commandId?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type DevToolsDiagnosticInput = Omit<DevToolsDiagnosticEvent, "id" | "time"> &
  Partial<Pick<DevToolsDiagnosticEvent, "id" | "time">>;

export type DevToolsDataSourceListener = () => void;

export type DevToolsSnapshotContext = {
  now: number;
};

export type DevToolsDataSource = {
  id: string;
  label: string;
  kind: DevToolsDataSourceKind;
  snapshot(ctx: DevToolsSnapshotContext): unknown;
  subscribe?(listener: DevToolsDataSourceListener): () => void;
  actions?: DevToolsCommandDefinition[] | undefined;
};

export type DevToolsPanelArea = "dock" | "modal" | "overlay" | "window";

export type DevToolsPanelDefinition = {
  id: string;
  label: string;
  area?: DevToolsPanelArea | undefined;
  order?: number | undefined;
  sourceKinds?: DevToolsDataSourceKind[] | undefined;
};

export type DevToolsLauncherPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type DevToolsLauncherOptions = {
  enabled?: boolean | undefined;
  panelId?: string | undefined;
  shellPanelId?: string | undefined;
  label?: string | undefined;
  position?: DevToolsLauncherPosition | undefined;
  hotkeys?: string[] | undefined;
};

export type DevToolsShellOptions = {
  enabled?: boolean | undefined;
  panelId?: string | undefined;
  title?: string | undefined;
  defaultOpen?: boolean | undefined;
  defaultPanelId?: string | undefined;
  refreshIntervalMs?: number | undefined;
};

export type DevToolsUiOptions = {
  enabled?: boolean | undefined;
  launcher?: boolean | DevToolsLauncherOptions | undefined;
  shell?: boolean | DevToolsShellOptions | undefined;
};

export type DevToolsUiSnapshot = {
  launcher: {
    enabled: boolean;
    panelId: string;
    shellPanelId: string;
    label: string;
    position: DevToolsLauncherPosition;
    hotkeys: string[];
  };
  shell: {
    enabled: boolean;
    panelId: string;
    title: string;
    open: boolean;
    activePanelId?: string | undefined;
    refreshIntervalMs?: number | undefined;
  };
};

export type DevToolsCommandScope = "debug" | "editor" | "test";

export type DevToolsCommandContext = {
  runtime: DevToolsRuntime;
  now: number;
};

export type DevToolsCommandDefinition = {
  id: string;
  label: string;
  scope: DevToolsCommandScope;
  destructive?: boolean | undefined;
  execute(ctx: DevToolsCommandContext, input?: unknown): void | Promise<void>;
};

export type DevToolsProfilerSample = {
  systemId: string;
  moduleId?: string | undefined;
  tick: number;
  startedAt: number;
  durationMs: number;
  tags?: string[] | undefined;
};

export type DevToolsProfilerSummary = {
  systemId: string;
  moduleId?: string | undefined;
  count: number;
  lastDurationMs: number;
  averageDurationMs: number;
  maxDurationMs: number;
  lastTick: number;
  tags: string[];
  overBudget: boolean;
};

export type DevToolsSourceSnapshot = {
  id: string;
  label: string;
  kind: DevToolsDataSourceKind;
  snapshot?: unknown;
  error?: {
    message: string;
    code: string;
  };
};

export type DevToolsSnapshotOptions = {
  includeSourceSnapshots?: boolean | undefined;
  traceKinds?: DevToolsTraceKind[] | undefined;
  sourceKinds?: DevToolsDataSourceKind[] | undefined;
};

export type DevToolsSnapshot = {
  traces: DevToolsTraceEntry[];
  diagnostics: DevToolsDiagnosticEvent[];
  dataSources: Array<{
    id: string;
    label: string;
    kind: DevToolsDataSourceKind;
  }>;
  sourceSnapshots?: DevToolsSourceSnapshot[] | undefined;
  panels: DevToolsPanelDefinition[];
  commands: Array<{
    id: string;
    label: string;
    scope: DevToolsCommandScope;
    destructive: boolean;
  }>;
  profiler: DevToolsProfilerSummary[];
};

export type DevToolsClearOptions = {
  traces?: boolean | undefined;
  diagnostics?: boolean | undefined;
  profiler?: boolean | undefined;
};

export type DevToolsRuntimeOptions = {
  traceLimit?: number | undefined;
  diagnosticLimit?: number | undefined;
  profilerBudgetMs?: number | undefined;
  clock?: (() => number) | undefined;
};

export type DevToolsRuntime = {
  registerDataSource(source: DevToolsDataSource): () => void;
  registerPanel(panel: DevToolsPanelDefinition): () => void;
  registerCommand(command: DevToolsCommandDefinition): () => void;
  pushTrace(entry: DevToolsTraceInput): DevToolsTraceEntry;
  pushDiagnostic(event: DevToolsDiagnosticInput): DevToolsDiagnosticEvent;
  markProfilerSample(sample: DevToolsProfilerSample): void;
  executeCommand(commandId: string, input?: unknown): Promise<void>;
  snapshot(options?: DevToolsSnapshotOptions): DevToolsSnapshot;
  clear(options?: DevToolsClearOptions): void;
  dispose(): void;
};
