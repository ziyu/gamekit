import { definePlatformService } from "./services";
import type {
  PlatformApp,
  PlatformClipboard,
  PlatformDialog,
  PlatformFileSystem,
  PlatformPath,
  PlatformPermissions,
  PlatformShell,
  PlatformStorage,
  PlatformWindow
} from "./types";

export const PlatformFileSystemServiceKey = definePlatformService<PlatformFileSystem>(
  "platform.fs",
  {
    description: "Semantic file-system access for durable saves, cache, resources, and documents."
  }
);

export const PlatformPathServiceKey = definePlatformService<PlatformPath>("platform.path", {
  description: "Path joining and normalization utilities for platform paths."
});

export const PlatformStorageServiceKey = definePlatformService<PlatformStorage>(
  "platform.storage",
  {
    description: "Small key-value storage for settings and lightweight local state."
  }
);

export const PlatformWindowServiceKey = definePlatformService<PlatformWindow>("platform.window", {
  description: "Application window sizing and title operations."
});

export const PlatformDialogServiceKey = definePlatformService<PlatformDialog>("platform.dialog", {
  description: "Native or host-provided dialogs."
});

export const PlatformClipboardServiceKey = definePlatformService<PlatformClipboard>(
  "platform.clipboard",
  {
    description: "Host clipboard text access."
  }
);

export const PlatformShellServiceKey = definePlatformService<PlatformShell>("platform.shell", {
  description: "Host shell operations such as opening external URLs."
});

export const PlatformPermissionsServiceKey = definePlatformService<PlatformPermissions>(
  "platform.permissions",
  {
    description: "Capability permission queries."
  }
);

export const PlatformAppServiceKey = definePlatformService<PlatformApp>("platform.app", {
  description: "Application metadata."
});
