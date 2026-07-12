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
  | "multiplayer"
  | "camera"
  | "physics"
  | "tca"
  | "gas"
  | "save"
  | "ui"
  | "custom";

export type DevToolsTraceKind =
  | "input"
  | "multiplayer"
  | "event"
  | "tca"
  | "gas"
  | "world"
  | "renderer"
  | "asset"
  | "camera"
  | "physics"
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

export type DevToolsCorrelationSummary = {
  correlationId: string;
  traceCount: number;
  firstTime: number;
  lastTime: number;
  lastTraceId: string;
  rootTraceIds: string[];
  kinds: Partial<Record<DevToolsTraceKind, number>>;
};

export type DevToolsCorrelationSourceSnapshot = {
  totalTraceCount: number;
  uncorrelatedTraceCount: number;
  retainedCorrelationCount: number;
  correlations: DevToolsCorrelationSummary[];
};

export type DevToolsCorrelationSourceOptions = {
  id?: string | undefined;
  label?: string | undefined;
  correlationLimit?: number | undefined;
  rootLimitPerCorrelation?: number | undefined;
};

export type DevToolsCorrelationSource = {
  readonly dataSource: DevToolsDataSource;
  push(entry: DevToolsTraceInput): DevToolsTraceEntry | undefined;
  snapshot(): DevToolsCorrelationSourceSnapshot;
  clear(): void;
  dispose(): void;
};

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

export type DevToolsPinnedPanelArea = "top" | "right" | "bottom" | "left" | "floating";

export type DevToolsPanelPinDefinition = {
  enabled?: boolean | undefined;
  defaultPinned?: boolean | undefined;
  defaultCollapsed?: boolean | undefined;
  icon?: string | undefined;
  label?: string | undefined;
  order?: number | undefined;
  area?: DevToolsPinnedPanelArea | undefined;
  size?: { width?: number | undefined; height?: number | undefined } | undefined;
  minSize?: { width?: number | undefined; height?: number | undefined } | undefined;
  refreshIntervalMs?: number | undefined;
};

export type DevToolsPanelDefinition = {
  id: string;
  label: string;
  area?: DevToolsPanelArea | undefined;
  order?: number | undefined;
  sourceKinds?: DevToolsDataSourceKind[] | undefined;
  pin?: DevToolsPanelPinDefinition | undefined;
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

export type DevToolsPinsOptions = {
  enabled?: boolean | undefined;
  defaultPinned?: string[] | undefined;
  defaultCollapsed?: string[] | undefined;
  collapseToTray?: boolean | undefined;
  area?: DevToolsPinnedPanelArea | undefined;
  refreshIntervalMs?: number | undefined;
};

export type DevToolsUiOptions = {
  enabled?: boolean | undefined;
  launcher?: boolean | DevToolsLauncherOptions | undefined;
  shell?: boolean | DevToolsShellOptions | undefined;
  pins?: boolean | DevToolsPinsOptions | undefined;
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
  pins: {
    enabled: boolean;
    defaultPinned: string[];
    defaultCollapsed: string[];
    collapseToTray: boolean;
    area: DevToolsPinnedPanelArea;
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

export type DevToolsProfilerSpanCategory =
  | "frame"
  | "runtime"
  | "system"
  | "service"
  | "renderer"
  | "asset"
  | "input"
  | "ui"
  | "devtools"
  | "custom";

export type DevToolsProfilerSpanInput = {
  name: string;
  category: DevToolsProfilerSpanCategory;
  source: string;
  parentId?: string | undefined;
  frameId?: string | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  startedAt?: number | undefined;
};

export type DevToolsProfilerSpanPatch = {
  tags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  durationMs?: number | undefined;
  endedAt?: number | undefined;
};

export type DevToolsProfilerSpanHandle = {
  id: string;
};

export type DevToolsProfilerFrameInput = {
  tick?: number | undefined;
  deltaMs: number;
  timestamp?: number | undefined;
  source?: string | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type DevToolsProfilerFrameHandle = {
  id: string;
};

export type DevToolsProfilerBudget = {
  id: string;
  label?: string | undefined;
  category?: DevToolsProfilerSpanCategory | undefined;
  source?: string | undefined;
  name?: string | undefined;
  tags?: string[] | undefined;
  warningMs: number;
  criticalMs?: number | undefined;
};

export type DevToolsProfilerSummary = {
  id: string;
  name: string;
  category: DevToolsProfilerSpanCategory;
  source: string;
  systemId?: string | undefined;
  moduleId?: string | undefined;
  count: number;
  lastDurationMs: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  lastTick: number;
  tags: string[];
  budgetId?: string | undefined;
  budgetWarningMs?: number | undefined;
  budgetCriticalMs?: number | undefined;
  overBudget: boolean;
  critical: boolean;
};

export type DevToolsProfilerFrameSummary = {
  id: string;
  tick?: number | undefined;
  timestamp: number;
  deltaMs: number;
  durationMs: number;
  runtimeMs: number;
  renderMs: number;
  uiMs: number;
  devtoolsMs: number;
  spanCount: number;
  overBudgetCount: number;
  tags: string[];
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
  profilerFrames: DevToolsProfilerFrameSummary[];
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
  profilerSpanLimit?: number | undefined;
  profilerFrameLimit?: number | undefined;
  profilerBudgets?: DevToolsProfilerBudget[] | undefined;
  clock?: (() => number) | undefined;
};

export type DevToolsRuntime = {
  registerDataSource(source: DevToolsDataSource): () => void;
  registerPanel(panel: DevToolsPanelDefinition): () => void;
  registerCommand(command: DevToolsCommandDefinition): () => void;
  pushTrace(entry: DevToolsTraceInput): DevToolsTraceEntry;
  pushDiagnostic(event: DevToolsDiagnosticInput): DevToolsDiagnosticEvent;
  markProfilerSample(sample: DevToolsProfilerSample): void;
  beginProfilerSpan(input: DevToolsProfilerSpanInput): DevToolsProfilerSpanHandle;
  endProfilerSpan(handle: DevToolsProfilerSpanHandle, patch?: DevToolsProfilerSpanPatch): void;
  measureProfilerSpan<T>(input: DevToolsProfilerSpanInput, fn: () => T): T;
  startProfilerFrame(input: DevToolsProfilerFrameInput): DevToolsProfilerFrameHandle;
  endProfilerFrame(handle: DevToolsProfilerFrameHandle): void;
  executeCommand(commandId: string, input?: unknown): Promise<void>;
  snapshot(options?: DevToolsSnapshotOptions): DevToolsSnapshot;
  clear(options?: DevToolsClearOptions): void;
  dispose(): void;
};
