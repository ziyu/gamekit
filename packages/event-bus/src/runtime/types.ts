export type EventCorrelation = {
  correlationId?: string | undefined;
  parentId?: string | undefined;
};

export type GameEvent<TPayload = unknown> = {
  type: string;
  payload: TPayload;
  timestamp: number;
  source?: string;
  correlationId?: string | undefined;
  parentId?: string | undefined;
};

export type EventListener<TPayload = unknown> = (event: GameEvent<TPayload>) => void;
export type AnyEventListener = (event: GameEvent) => void;

export type EventBus = {
  emit<TPayload>(
    type: string,
    payload: TPayload,
    source?: string,
    correlation?: EventCorrelation
  ): void;
  on<TPayload = unknown>(type: string, listener: EventListener<TPayload>): () => void;
  onAny(listener: AnyEventListener): () => void;
  clear(): void;
};

export type EventBusOptions = {
  clock?: () => number;
};
