import type { DataRef, DataRegistry } from "@gamekit/data";
import type { EventBus } from "@gamekit/event-bus";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { NavigationHandle, NavigationPoint } from "@gamekit/navigation-core";
import type { EntityId, GameWorld } from "@gamekit/world";

export type AiAgentId = string;

export type AiAgentBinding = {
  agentId: AiAgentId;
  definitionId: string;
  entityId?: EntityId | undefined;
  actorId?: string | undefined;
};

export type AiAgentDefinition = {
  id: string;
  sensors: Array<DataRef<"ai.sensor">>;
  goals: Array<DataRef<"ai.goal">>;
  decisionIntervalMs: number;
  memoryLimit: number;
  schedulerClass?: string | undefined;
  tags?: string[] | undefined;
};

export type AiSensorDefinition = {
  id: string;
  sampler: string;
  intervalMs: number;
  args?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
};

export type AiUtilityCurve =
  | { type: "linear"; min?: number | undefined; max?: number | undefined }
  | { type: "inverse"; min?: number | undefined; max?: number | undefined }
  | { type: "step"; threshold: number; below?: number | undefined; above?: number | undefined }
  | { type: "power"; exponent: number; min?: number | undefined; max?: number | undefined }
  | { type: "points"; points: Array<{ x: number; y: number }> };

export type AiConsiderationDefinition = {
  input: string;
  curve: AiUtilityCurve;
  weight?: number | undefined;
};

export type AiGoalDefinition = {
  id: string;
  task: DataRef<"ai.task">;
  considerations: AiConsiderationDefinition[];
  weight?: number | undefined;
  minScore?: number | undefined;
  commitmentMs?: number | undefined;
  switchThreshold?: number | undefined;
  cooldownMs?: number | undefined;
  tags?: string[] | undefined;
};

export type AiTaskInterruptPolicy = "always" | "safe-point" | "never";

export type AiTaskDefinition = {
  id: string;
  executor: string;
  interruptPolicy?: AiTaskInterruptPolicy | undefined;
  timeoutMs?: number | undefined;
  args?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
};

export type AiPerceptionFact = {
  key: string;
  subjectId?: string | undefined;
  position?: NavigationPoint | undefined;
  value?: number | string | boolean | undefined;
  observedAt: number;
  expiresAt?: number | undefined;
  confidence?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type AiIntent =
  | {
      type: "movement";
      agentId: AiAgentId;
      desiredVelocity: NavigationPoint;
      source: string;
    }
  | {
      type: "aim";
      agentId: AiAgentId;
      targetId?: string | undefined;
      direction?: NavigationPoint | undefined;
      source: string;
    }
  | {
      type: "action";
      agentId: AiAgentId;
      actionId: string;
      targetId?: string | undefined;
      position?: NavigationPoint | undefined;
      source: string;
    }
  | {
      type: "interaction";
      agentId: AiAgentId;
      interactionId: string;
      targetId?: string | undefined;
      source: string;
    }
  | {
      type: "navigation-request";
      agentId: AiAgentId;
      requestId: string;
      source: string;
    }
  | {
      type: "navigation-cancel";
      agentId: AiAgentId;
      requestId: string;
      source: string;
    };

export type AiIntentInput = AiIntent extends infer TIntent
  ? TIntent extends AiIntent
    ? Omit<TIntent, "agentId" | "source">
    : never
  : never;

export type AiIntentSink = {
  emit(intent: AiIntent): void;
};

export type AiAgentReadContext = {
  elapsed: number;
  agent: AiAgentBinding;
  definition: AiAgentDefinition;
  world: GameWorld;
  navigation?: NavigationHandle | undefined;
  facts(): AiPerceptionFact[];
  fact(key: string, subjectId?: string | undefined): AiPerceptionFact | undefined;
  blackboard<T = unknown>(key: string): T | undefined;
};

export type AiSensorSampler = {
  id: string;
  sample(context: AiAgentReadContext, definition: AiSensorDefinition): AiPerceptionFact[];
};

export type AiUtilityInputResolver = {
  id: string;
  read(context: AiAgentReadContext, consideration: AiConsiderationDefinition): number;
};

export type AiTaskStatus = "starting" | "running" | "succeeded" | "failed" | "cancelled";

export type AiTaskStep = {
  status: "running" | "succeeded" | "failed";
  state?: Record<string, unknown> | undefined;
  safeToInterrupt?: boolean | undefined;
  reason?: string | undefined;
};

export type AiTaskContext = AiAgentReadContext & {
  goal: AiGoalDefinition;
  task: AiTaskDefinition;
  state: Record<string, unknown>;
  emit(intent: AiIntentInput): void;
  setBlackboard(key: string, value: unknown): void;
  deleteBlackboard(key: string): void;
};

export type AiTaskExecutor = {
  id: string;
  start(context: AiTaskContext): AiTaskStep;
  update(context: AiTaskContext, deltaMs: number): AiTaskStep;
  cancel?(context: AiTaskContext, reason: string): void;
};

export type AiPlanner = {
  id: string;
  plan(input: {
    agent: AiAgentBinding;
    goal: AiGoalDefinition;
    facts: AiPerceptionFact[];
    maxSteps: number;
    maxExpandedNodes: number;
  }): { status: "planned"; taskIds: string[] } | { status: "failed"; reason: string };
};

export type AiGoalScore = {
  goalId: string;
  score: number;
  eligible: boolean;
  considerations: Array<{
    input: string;
    raw: number;
    curved: number;
    weight: number;
  }>;
};

export type AiTaskState = {
  taskId: string;
  executorId: string;
  status: AiTaskStatus;
  startedAt: number;
  updatedAt: number;
  safeToInterrupt: boolean;
  state: Record<string, unknown>;
  failureReason?: string | undefined;
};

export type AiAgentSnapshot = {
  binding: AiAgentBinding;
  goalId?: string | undefined;
  goalScore?: number | undefined;
  committedUntil?: number | undefined;
  task?: AiTaskState | undefined;
  memorySize: number;
  blackboardKeys: string[];
  nextDecisionAt: number;
  delayedDecisions: number;
};

export type AiRuntimeSnapshot = {
  id: string;
  elapsed: number;
  disposed: boolean;
  compiledDefinitions: number;
  agents: AiAgentSnapshot[];
  activeTasks: number;
  memoryFacts: number;
  intentsEmitted: number;
  delayedSensorSamples: number;
  delayedDecisions: number;
  traceEntries: number;
};

export type AiTraceKind =
  | "lifecycle"
  | "perception"
  | "decision"
  | "goal"
  | "task"
  | "intent"
  | "budget";

export type AiTraceEntry = {
  sequence: number;
  kind: AiTraceKind;
  label: string;
  timestamp: number;
  agentId?: AiAgentId | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type AiAgentCheckpoint = {
  binding: AiAgentBinding;
  memory: AiPerceptionFact[];
  blackboard: Record<string, unknown>;
  currentGoalId?: string | undefined;
  currentGoalScore?: number | undefined;
  committedUntil?: number | undefined;
  task?: AiTaskState | undefined;
  cooldowns: Array<[string, number]>;
  nextDecisionAt: number;
  nextSensorAt: Array<[string, number]>;
  delayedDecisions: number;
};

export type AiRuntimeCheckpoint = {
  version: 1;
  elapsed: number;
  agents: AiAgentCheckpoint[];
};

export type AiRestoreOptions = {
  resolveEntityId?: ((savedEntityId: EntityId) => EntityId | undefined) | undefined;
};

export type AiRuntime = {
  bind(binding: AiAgentBinding): void;
  unbind(agentId: AiAgentId, reason?: string | undefined): void;
  hasAgent(agentId: AiAgentId): boolean;
  observe(agentId: AiAgentId, facts: AiPerceptionFact[]): void;
  setBlackboard(agentId: AiAgentId, key: string, value: unknown): void;
  deleteBlackboard(agentId: AiAgentId, key: string): void;
  getAgent(agentId: AiAgentId): AiAgentSnapshot | undefined;
  listAgents(): AiAgentSnapshot[];
  scoreGoals(agentId: AiAgentId): AiGoalScore[];
  update(deltaMs: number, elapsedMs: number): void;
  captureCheckpoint(): AiRuntimeCheckpoint;
  restoreCheckpoint(checkpoint: AiRuntimeCheckpoint, options?: AiRestoreOptions | undefined): void;
  snapshot(): AiRuntimeSnapshot;
  traces(): AiTraceEntry[];
  dispose(): void;
};

export type AiHandle = Omit<AiRuntime, "update" | "dispose"> & {
  isBound(): boolean;
};

export type AiSchedulerClass = {
  id: string;
  decisionIntervalMultiplier?: number | undefined;
  sensorIntervalMultiplier?: number | undefined;
  priority?: number | undefined;
};

export type CreateAiRuntimeOptions = {
  id?: string | undefined;
  dataRegistry: DataRegistry;
  world: GameWorld;
  eventBus?: EventBus | undefined;
  navigation?: NavigationHandle | undefined;
  intentSink: AiIntentSink;
  sensors?: AiSensorSampler[] | undefined;
  inputs?: AiUtilityInputResolver[] | undefined;
  tasks?: AiTaskExecutor[] | undefined;
  schedulerClasses?: AiSchedulerClass[] | undefined;
  maxSensorSamplesPerTick?: number | undefined;
  maxDecisionsPerTick?: number | undefined;
  failureBackoffMs?: number | undefined;
  traceLimit?: number | undefined;
  onTrace?: ((entry: AiTraceEntry) => void) | undefined;
  onTraceError?: ((error: unknown, entry: AiTraceEntry) => void) | undefined;
};

export type CreateAiModuleOptions = Omit<CreateAiRuntimeOptions, "world" | "eventBus"> & {
  eventBus?: EventBus | undefined;
  handle?: AiHandle | undefined;
  onRuntime?: ((runtime: AiRuntime, context: GameInstallContext) => void) | undefined;
};
