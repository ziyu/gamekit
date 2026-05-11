export type RendererDiagnosticEvent<TPayload = Record<string, unknown>> = {
  type: string;
  payload: TPayload;
  source?: string;
};

export type RendererDiagnosticListener = (event: RendererDiagnosticEvent) => void;
