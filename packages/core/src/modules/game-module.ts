export type GameModuleCleanup = () => void;

export type GameModuleDisposable = {
  dispose(): void;
};

export type GameModuleInstallResult = void | GameModuleCleanup | GameModuleDisposable;

export type GameModule<TInstallContext = unknown> = {
  id: string;
  install: (ctx: TInstallContext) => GameModuleInstallResult;
};

export function defineGameModule<TInstallContext>(
  module: GameModule<TInstallContext>
): GameModule<TInstallContext> {
  return module;
}
