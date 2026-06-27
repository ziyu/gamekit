export type DriverId = string;

export type DriverLifecyclePhase = "registered" | "booted" | "started" | "stopped" | "disposed";

export type DriverViewportSize = {
  width: number;
  height: number;
};

export type DriverDiagnosticEvent = {
  type: string;
  source?: string;
  payload: Record<string, unknown>;
};

export type DriverBootContext = DriverViewportSize & {
  container?: unknown;
  debug?: boolean;
  onDiagnostic?: (event: DriverDiagnosticEvent) => void;
};

export type DriverCapabilities = {
  renderer?: boolean;
  input?: boolean;
  assets?: boolean;
  camera?: boolean;
  audio?: boolean;
  particles?: boolean;
  physics?: boolean;
  scenes?: boolean;
  custom?: Record<string, boolean | string | number>;
};

export type DriverAdapterMap = {
  renderer?: unknown;
  inputSource?: unknown;
  assetLoader?: unknown;
  camera?: unknown;
  custom?: Record<string, unknown>;
};

export type DriverSnapshot = {
  id: DriverId;
  kind: string;
  phase: DriverLifecyclePhase;
  capabilities: DriverCapabilities;
  adapters: string[];
  details?: Record<string, unknown>;
};

export type GameDriver<TAdapters extends DriverAdapterMap = DriverAdapterMap> = {
  id: DriverId;
  kind: string;
  boot(ctx: DriverBootContext): Promise<void> | void;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  resize?(size: DriverViewportSize): void;
  dispose(): Promise<void> | void;
  capabilities(): DriverCapabilities;
  adapters(): TAdapters;
  native?(): unknown;
  snapshot(): DriverSnapshot;
};

export type DriverRegistrySnapshot = {
  drivers: DriverSnapshot[];
};

export type DriverRegistry = {
  register(driver: GameDriver): void;
  has(id: DriverId): boolean;
  get<TDriver extends GameDriver = GameDriver>(id: DriverId): TDriver | undefined;
  require<TDriver extends GameDriver = GameDriver>(id: DriverId): TDriver;
  list(): GameDriver[];
  snapshot(): DriverRegistrySnapshot;
};
