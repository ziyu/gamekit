# Platform 模块设计

## 定位

Platform 隔离 Web、Tauri、Electron、移动端等平台差异。业务代码不直接调用 Tauri API、浏览器文件 API 或系统窗口 API。

相关包：

- `@gamekit/platform-core`
- `@gamekit/platform-web`
- `@gamekit/platform-tauri`

## PlatformRuntime

```ts
export type PlatformRuntime = {
  id: "web" | "tauri" | "electron" | "native";

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
```

## 文件系统

```ts
export type PlatformFileSystem = {
  readText(path: string, options?: FsOptions): Promise<string>;
  writeText(path: string, content: string, options?: FsOptions): Promise<void>;
  readBinary(path: string, options?: FsOptions): Promise<Uint8Array>;
  writeBinary(path: string, data: Uint8Array, options?: FsOptions): Promise<void>;
  exists(path: string, options?: FsOptions): Promise<boolean>;
  createDir(path: string, options?: FsOptions): Promise<void>;
  listDir(path: string, options?: FsOptions): Promise<PlatformDirEntry[]>;
};

export type FsBaseDir =
  | "appData"
  | "appConfig"
  | "appCache"
  | "document"
  | "download"
  | "resource"
  | "temp";
```

业务层写语义路径，不写绝对路径。

## 路径策略

- 内置资源：`resource`
- 用户存档：`appData/saves`
- 用户设置：`appConfig/settings`
- 缓存：`appCache`
- 导出文件：`document` 或用户选择路径
- Mod：`appData/mods` 或用户授权目录

## Tauri Adapter

`@gamekit/platform-tauri` 负责映射：

- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-shell`
- `@tauri-apps/api/window`

这些包不能散落到 gameplay、save、asset、editor 代码中。

## Tauri 权限

Tauri v2 capabilities 必须最小授权：

- 默认游戏运行：读取内置资源，读写 appData saves，读写 appConfig settings。
- 编辑器模式：额外允许文件对话框和 DataPack import/export。
- Mod 模式：用户选择目录后授权访问。

不要为了方便开放整个文件系统。

## 与 Asset 的关系

AssetManager 不假设资源一定来自 HTTP URL。

```ts
export type AssetSource =
  | { type: "url"; url: string }
  | { type: "platform-file"; path: string; baseDir: FsBaseDir }
  | { type: "resource"; path: string }
  | { type: "memory"; data: Uint8Array; mimeType?: string };
```

## 与 Save 的关系

SaveSystem 通过 PlatformStorage / PlatformFileSystem 读写，不直接调用 localStorage 或 Tauri FS。

## 与 Input 的关系

Tauri 桌面端需要额外处理：

- 窗口焦点
- 应用快捷键
- 菜单命令
- 文件拖拽导入
- 窗口大小变化
- 多窗口编辑器

这些应转成 platform/input/system event，再由 Runtime 分发。
