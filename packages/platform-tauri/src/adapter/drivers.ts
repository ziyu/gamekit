import type {
  TauriAppDriver,
  TauriClipboardDriver,
  TauriDialogDriver,
  TauriFsDriver,
  TauriPlatformDrivers,
  TauriShellDriver,
  TauriWindowDriver
} from "./types";

type Importer = (specifier: string) => Promise<any>;

const dynamicImport: Importer = new Function("specifier", "return import(specifier)") as Importer;

export async function createDefaultTauriDrivers(): Promise<TauriPlatformDrivers> {
  const [fs, dialog, clipboard, shell, appApi, windowApi] = await Promise.all([
    dynamicImport("@tauri-apps/plugin-fs"),
    dynamicImport("@tauri-apps/plugin-dialog"),
    dynamicImport("@tauri-apps/plugin-clipboard-manager"),
    dynamicImport("@tauri-apps/plugin-shell"),
    dynamicImport("@tauri-apps/api/app"),
    dynamicImport("@tauri-apps/api/window")
  ]);

  return {
    fs: createFsDriver(fs),
    dialog: createDialogDriver(dialog),
    clipboard: createClipboardDriver(clipboard),
    shell: createShellDriver(shell),
    window: createWindowDriver(windowApi),
    app: createAppDriver(appApi)
  };
}

function createFsDriver(fs: any): TauriFsDriver {
  return {
    BaseDirectory: fs.BaseDirectory,
    readTextFile: fs.readTextFile,
    writeTextFile: fs.writeTextFile,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    exists: fs.exists,
    mkdir: fs.mkdir,
    remove: fs.remove,
    readDir: fs.readDir
  };
}

function createDialogDriver(dialog: any): TauriDialogDriver {
  return {
    open: dialog.open,
    save: dialog.save,
    message: dialog.message
  };
}

function createClipboardDriver(clipboard: any): TauriClipboardDriver {
  return {
    readText: clipboard.readText,
    writeText: clipboard.writeText,
    clear: clipboard.clear
  };
}

function createShellDriver(shell: any): TauriShellDriver {
  return {
    open: shell.open
  };
}

function createWindowDriver(windowApi: any): TauriWindowDriver {
  const currentWindow = windowApi.getCurrentWindow();

  return {
    getSize: () => currentWindow.innerSize(),
    async setSize(size) {
      await currentWindow.setSize(new windowApi.LogicalSize(size.width, size.height));
    },
    setTitle: (title) => currentWindow.setTitle(title)
  };
}

function createAppDriver(appApi: any): TauriAppDriver {
  return {
    getName: appApi.getName,
    getVersion: appApi.getVersion
  };
}
