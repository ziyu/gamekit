import type { GameKitStyleProviderProps } from "./types";

export function GameKitStyleProvider({
  children,
  className,
  density = "comfortable",
  motion = "system",
  style,
  theme = "gamekit"
}: GameKitStyleProviderProps) {
  return (
    <div
      className={className ?? "gamekit-ui-shell"}
      data-gamekit-density={density}
      data-gamekit-motion={motion}
      data-gamekit-theme={theme}
      data-gamekit-ui-shell=""
      style={style}
    >
      {children}
    </div>
  );
}
