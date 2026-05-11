export type PlatformRuntimeId = "web" | "tauri" | "electron" | "native" | (string & {});

export type PlatformServiceId = string;

export type PlatformServiceKey<TService> = {
  id: PlatformServiceId;
  optional?: boolean;
  description?: string;
  _service?: TService;
};

export type PlatformServiceRegistry = {
  has<TService>(key: PlatformServiceKey<TService>): boolean;
  get<TService>(key: PlatformServiceKey<TService>): TService | undefined;
  require<TService>(key: PlatformServiceKey<TService>): TService;
  register<TService>(key: PlatformServiceKey<TService>, service: TService): void;
  list(): PlatformServiceId[];
};

export type PlatformCapabilityId = string;

export type PlatformCapabilityDescriptor<
  TDetails extends Record<string, unknown> = Record<string, unknown>
> = {
  id: PlatformCapabilityId;
  service?: PlatformServiceId;
  description?: string;
  details?: TDetails;
};

export type PlatformCapabilityState = {
  id: PlatformCapabilityId;
  available: boolean;
  permission: PlatformPermissionState;
  reason?: string;
};

export type PlatformCapabilityRegistry = {
  register(descriptor: PlatformCapabilityDescriptor): void;
  describe(capability: PlatformCapabilityId): PlatformCapabilityDescriptor | undefined;
  query(capability: PlatformCapabilityId): Promise<PlatformCapabilityState>;
  list(): PlatformCapabilityDescriptor[];
};

export type FsBaseDir =
  | "appData"
  | "appConfig"
  | "appCache"
  | "document"
  | "download"
  | "resource"
  | "temp";

export type FsOptions = {
  baseDir?: FsBaseDir;
  recursive?: boolean;
};

export type PlatformDirEntry = {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
};

export type PlatformFileSystem = {
  readText(path: string, options?: FsOptions): Promise<string>;
  writeText(path: string, content: string, options?: FsOptions): Promise<void>;
  readBinary(path: string, options?: FsOptions): Promise<Uint8Array>;
  writeBinary(path: string, data: Uint8Array, options?: FsOptions): Promise<void>;
  exists(path: string, options?: FsOptions): Promise<boolean>;
  createDir(path: string, options?: FsOptions): Promise<void>;
  listDir(path: string, options?: FsOptions): Promise<PlatformDirEntry[]>;
};

export type PlatformPath = {
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  normalize(path: string): string;
};

export type PlatformStorage = {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
};

export type PlatformWindowSize = {
  width: number;
  height: number;
};

export type PlatformWindow = {
  getSize(): Promise<PlatformWindowSize>;
  setSize(size: PlatformWindowSize): Promise<void>;
  setTitle(title: string): Promise<void>;
};

export type PlatformDialogOpenOptions = {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
};

export type PlatformDialogSaveOptions = {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
};

export type PlatformDialogMessageOptions = {
  title?: string;
  message: string;
  kind?: "info" | "warning" | "error";
};

export type PlatformDialog = {
  open(options?: PlatformDialogOpenOptions): Promise<string | string[] | undefined>;
  save(options?: PlatformDialogSaveOptions): Promise<string | undefined>;
  message(options: PlatformDialogMessageOptions): Promise<void>;
};

export type PlatformClipboard = {
  readText(): Promise<string | undefined>;
  writeText(text: string): Promise<void>;
  clear(): Promise<void>;
};

export type PlatformShell = {
  open(target: string): Promise<void>;
};

export type PlatformCapability =
  | "fs.read"
  | "fs.write"
  | "storage"
  | "window"
  | "dialog.open"
  | "dialog.save"
  | "dialog.message"
  | "clipboard"
  | "shell.open"
  | (string & {});

export type PlatformPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export type PlatformPermissions = {
  query(capability: PlatformCapability): Promise<PlatformPermissionState>;
};

export type PlatformApp = {
  name(): Promise<string>;
  version(): Promise<string | undefined>;
};

export type PlatformStandardServices = {
  fs: PlatformFileSystem;
  path: PlatformPath;
  storage: PlatformStorage;
  window: PlatformWindow;
  dialog: PlatformDialog;
  clipboard: PlatformClipboard;
  shell: PlatformShell;
  permissions: PlatformPermissions;
  app: PlatformApp;
};

export type PlatformServices = PlatformServiceRegistry & PlatformStandardServices;

export type PlatformRuntime = {
  id: PlatformRuntimeId;
  services: PlatformServices;
  capabilities: PlatformCapabilityRegistry;
};
