import { useEffect } from "react";
import type { UiOpenPanel } from "@gamekit/ui-core";
import { UiRuntimeProvider, useUiRuntime, useUiSnapshot } from "./provider";
import { GameKitStyleProvider } from "./style-provider";
import type { FocusBridgeProps, GameKitUiShellProps, UiHostProps, UiTipProps } from "./types";

export function GameKitUiShell({
  runtime,
  children,
  className,
  density,
  motion,
  style,
  theme
}: GameKitUiShellProps) {
  return (
    <UiRuntimeProvider runtime={runtime}>
      <GameKitStyleProvider
        className={className}
        density={density}
        motion={motion}
        style={style}
        theme={theme}
      >
        {children}
      </GameKitStyleProvider>
    </UiRuntimeProvider>
  );
}

export function UiPanelHost({ renderPanel, className }: UiHostProps) {
  const snapshot = useUiSnapshot();
  const panels = snapshot.openPanels.filter((panel) => panel.kind === "panel");
  return <UiHost className={className} panels={panels} renderPanel={renderPanel} />;
}

export function UiWindowHost({ renderPanel, className }: UiHostProps) {
  const snapshot = useUiSnapshot();
  const panels = snapshot.openPanels.filter(
    (panel) => panel.kind === "window" || panel.kind === "devtools"
  );
  return <UiHost className={className} panels={panels} renderPanel={renderPanel} />;
}

export function UiModalHost({ renderPanel, className }: UiHostProps) {
  const snapshot = useUiSnapshot();
  const panels = snapshot.openPanels.filter((panel) => panel.kind === "modal");
  return <UiHost className={className} panels={panels} renderPanel={renderPanel} />;
}

export function UiTip({ children, className, content, side = "top" }: UiTipProps) {
  return (
    <span className={`gamekit-ui-tip${className ? ` ${className}` : ""}`} data-tip-side={side}>
      <span className="gamekit-ui-tip__anchor">{children}</span>
      <span className="gamekit-ui-tip__bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}

export function UiFocusBridge({ runtime, gameViewportRef, uiRootRef }: FocusBridgeProps) {
  useEffect(() => {
    const gameViewport = gameViewportRef?.current;
    const uiRoot = uiRootRef?.current;
    const cleanups: Array<() => void> = [];

    if (gameViewport) {
      const focusGame = () => {
        runtime.setFocus({ scope: "game", target: "viewport", reason: "focus.game" });
      };
      gameViewport.addEventListener("focusin", focusGame);
      gameViewport.addEventListener("pointerdown", focusGame);
      cleanups.push(() => {
        gameViewport.removeEventListener("focusin", focusGame);
        gameViewport.removeEventListener("pointerdown", focusGame);
      });
    }

    if (uiRoot) {
      const focusUi = (event: Event) => {
        const target = event.target;
        const scope =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable)
            ? "text-input"
            : "ui";
        runtime.setFocus({ scope, target: readTargetId(target), reason: "focus.ui" });
      };
      uiRoot.addEventListener("focusin", focusUi);
      uiRoot.addEventListener("pointerdown", focusUi);
      cleanups.push(() => {
        uiRoot.removeEventListener("focusin", focusUi);
        uiRoot.removeEventListener("pointerdown", focusUi);
      });
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [gameViewportRef, runtime, uiRootRef]);

  return null;
}

function UiHost({ panels, renderPanel, className }: UiHostProps & { panels: UiOpenPanel[] }) {
  const runtime = useUiRuntime();
  return (
    <div className={className}>
      {panels.map((panel) => (
        <section
          key={panel.id}
          className={`gamekit-ui-panel gamekit-ui-panel--${panel.kind}${panel.focused ? " is-focused" : ""}`}
          data-ui-panel={panel.id}
        >
          <header className="gamekit-ui-panel__header">
            <strong>{panel.title}</strong>
            <button
              type="button"
              aria-label={`Close ${panel.title}`}
              onClick={() => runtime.close(panel.id)}
            >
              ×
            </button>
          </header>
          <div className="gamekit-ui-panel__body">{renderPanel?.(panel) ?? null}</div>
        </section>
      ))}
    </div>
  );
}

function readTargetId(target: EventTarget | null): string | undefined {
  if (!(target instanceof HTMLElement)) {
    return undefined;
  }
  return target.dataset.uiPanel ?? (target.id || target.getAttribute("aria-label") || undefined);
}
