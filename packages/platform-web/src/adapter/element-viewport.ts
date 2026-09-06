export type ElementViewportSize = {
  width: number;
  height: number;
};

export type ElementViewportObserver = {
  observe(target: Element): void;
  disconnect(): void;
};

export type ElementViewportObserverFactory = (
  notify: () => void
) => ElementViewportObserver | undefined;

export type ObserveElementViewportOptions = {
  element: Element;
  onResize(viewport: ElementViewportSize): void;
  fallback?: ElementViewportSize | undefined;
  createObserver?: ElementViewportObserverFactory | undefined;
};

const MINIMUM_VIEWPORT_SIZE: ElementViewportSize = { width: 1, height: 1 };

export function measureElementViewport(
  element: Pick<Element, "getBoundingClientRect">,
  fallback: ElementViewportSize = MINIMUM_VIEWPORT_SIZE
): ElementViewportSize {
  const bounds = element.getBoundingClientRect();
  return {
    width: normalizeViewportDimension(bounds.width, fallback.width),
    height: normalizeViewportDimension(bounds.height, fallback.height)
  };
}

export function observeElementViewport(options: ObserveElementViewportOptions): () => void {
  const createObserver = options.createObserver ?? createNativeResizeObserver;
  let current: ElementViewportSize | undefined;
  let stopped = false;

  const publish = () => {
    if (stopped) {
      return;
    }
    const next = measureElementViewport(options.element, options.fallback);
    if (current?.width === next.width && current.height === next.height) {
      return;
    }
    current = next;
    options.onResize(next);
  };

  publish();
  const observer = createObserver(publish);
  observer?.observe(options.element);

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    observer?.disconnect();
  };
}

function createNativeResizeObserver(notify: () => void): ElementViewportObserver | undefined {
  if (typeof ResizeObserver === "undefined") {
    return undefined;
  }
  return new ResizeObserver(() => notify());
}

function normalizeViewportDimension(value: number, fallback: number): number {
  const resolved = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.max(1, Math.round(Number.isFinite(resolved) && resolved > 0 ? resolved : 1));
}
