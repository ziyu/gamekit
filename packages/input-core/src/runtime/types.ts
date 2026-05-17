export type InputDevice = "keyboard" | "mouse" | "touch" | "gamepad" | "pen" | "virtual" | "system";

export type InputPhase = "pressed" | "released" | "held" | "moved" | "scrolled" | "cancelled";

export type InputModifierKey = "shift" | "ctrl" | "alt" | "meta";

export type InputModifiers = Partial<Record<InputModifierKey, boolean>>;

export type InputScopeId = string;

export type NormalizedInputEvent = {
  id: string;
  device: InputDevice;
  phase: InputPhase;
  code?: string;
  button?: string;
  pointerId?: string;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  wheelDelta?: number;
  modifiers?: InputModifiers;
  scope?: InputScopeId;
  timestamp: number;
  source?: string;
  originalEvent?: unknown;
};

export type InputBinding = {
  device: InputDevice;
  code?: string;
  button?: string;
  phase?: InputPhase;
  modifiers?: InputModifierKey[];
};

export type InputActionId = string;

export type InputActionDefinition = {
  id: InputActionId;
  name: string;
  category?: string;
  scopes?: InputScopeId[];
  defaultBindings: InputBinding[];
};

export type InputContextId = string;

export type InputContext = {
  id: InputContextId;
  priority: number;
  enabled?: boolean;
  actionIds?: InputActionId[];
  scopes?: InputScopeId[];
  capture?: boolean;
};

export type InputActionEvent = {
  id: string;
  actionId: InputActionId;
  contextId: InputContextId;
  phase: InputPhase;
  value: number;
  input: NormalizedInputEvent;
  timestamp: number;
  source?: string;
};

export type InputActionListener = (event: InputActionEvent) => void;

export type InputUnsubscribe = () => void;

export type InputFrame = {
  delta?: number | undefined;
  timestamp: number;
};

export type InputRouter = {
  registerAction(definition: InputActionDefinition): void;
  unregisterAction(actionId: InputActionId): void;
  setActionBindings(actionId: InputActionId, bindings: InputBinding[]): void;
  addContext(context: InputContext): void;
  removeContext(contextId: InputContextId): void;
  enableContext(contextId: InputContextId): void;
  disableContext(contextId: InputContextId): void;
  activeContexts(): InputContext[];
  handle(input: NormalizedInputEvent): InputActionEvent[];
  tick(frame: InputFrame): InputActionEvent[];
  onAction(listener: InputActionListener): InputUnsubscribe;
};

export type InputSourceAdapter = {
  start(): void;
  stop(): void;
  destroy(): void;
};
