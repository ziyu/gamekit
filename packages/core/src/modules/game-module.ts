export type GameModule<TInstallContext = unknown> = {
  id: string;
  install: (ctx: TInstallContext) => void;
};

export function defineGameModule<TInstallContext>(
  module: GameModule<TInstallContext>
): GameModule<TInstallContext> {
  return module;
}
