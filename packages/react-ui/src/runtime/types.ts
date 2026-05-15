import type { CSSProperties, ReactNode } from "react";
import type { UiOpenPanel, UiRuntime, UiRuntimeSnapshot } from "@gamekit/ui-core";

export type UiPanelRenderer = (panel: UiOpenPanel) => ReactNode;

export type GameKitUiDensity = "compact" | "comfortable" | "spacious";

export type GameKitUiMotionPreference = "system" | "reduced" | "full";

export type GameKitStyleProviderProps = {
  children?: ReactNode;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  density?: GameKitUiDensity | undefined;
  motion?: GameKitUiMotionPreference | undefined;
  theme?: string | undefined;
};

export type GameKitUiShellProps = {
  runtime: UiRuntime;
  children?: ReactNode;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  density?: GameKitUiDensity | undefined;
  motion?: GameKitUiMotionPreference | undefined;
  theme?: string | undefined;
};

export type UiRuntimeProviderProps = {
  runtime: UiRuntime;
  children: ReactNode;
};

export type UiHostProps = {
  renderPanel?: UiPanelRenderer | undefined;
  className?: string | undefined;
};

export type UiTipSide = "top" | "right" | "bottom" | "left";

export type UiTipProps = {
  children: ReactNode;
  content: ReactNode;
  side?: UiTipSide | undefined;
  className?: string | undefined;
};

export type FocusBridgeProps = {
  runtime: UiRuntime;
  gameViewportRef?: React.RefObject<HTMLElement> | undefined;
  uiRootRef?: React.RefObject<HTMLElement> | undefined;
};

export type UiRuntimeSelector<TValue> = (snapshot: UiRuntimeSnapshot) => TValue;

export type GameKitUiAnimationOptions = {
  reducedMotion?: boolean | undefined;
  duration?: number | undefined;
};

export type GameKitUiExitAnimationOptions = GameKitUiAnimationOptions & {
  onComplete?: (() => void) | undefined;
};

export type GameKitUiAnimator = {
  enter(element: Element, options?: GameKitUiAnimationOptions): void;
  exit(element: Element, options?: GameKitUiExitAnimationOptions): void;
  emphasize(element: Element, options?: GameKitUiAnimationOptions): void;
};
