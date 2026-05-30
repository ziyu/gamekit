import type { DataRegistry } from "@gamekit/data";
import type { EventBus } from "@gamekit/event-bus";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { TcaDefinitionSet } from "@gamekit/tca";
import type { EntityId, GameWorld } from "@gamekit/world";

export type GasActorId = string;
export type GasDefinitionId = string;
export type GasAttributeId = string;
export type GasTagId = string;
export type GasAbilityId = string;
export type GasEffectId = string;
export type GasCueId = string;

export type GasActorDefinition = {
  id: GasDefinitionId;
  name?: string | undefined;
  attributes?: Record<GasAttributeId, number> | undefined;
  tags?: GasTagId[] | undefined;
  abilities?: GasAbilityId[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type GasAttributeDefinition = {
  id: GasAttributeId;
  name?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  defaultValue?: number | undefined;
  tags?: string[] | undefined;
};

export type GasAbilityDefinition = {
  id: GasAbilityId;
  name?: string | undefined;
  requiredTags?: GasTagId[] | undefined;
  blockedTags?: GasTagId[] | undefined;
  costs?: GasAttributeCost[] | undefined;
  cooldownMs?: number | undefined;
  effects?: GasEffectApplicationDefinition[] | undefined;
  cues?: GasCueId[] | undefined;
  tags?: string[] | undefined;
};

export type GasAttributeCost = {
  attribute: GasAttributeId;
  amount: number;
};

export type GasEffectApplicationDefinition = {
  effectId: GasEffectId;
  target?: "self" | "target" | undefined;
};

export type GasEffectDefinition = {
  id: GasEffectId;
  name?: string | undefined;
  durationMs?: number | undefined;
  periodMs?: number | undefined;
  attributeModifiers?: GasAttributeModifier[] | undefined;
  periodicModifiers?: GasAttributeModifier[] | undefined;
  grantedTags?: GasTagId[] | undefined;
  removedTags?: GasTagId[] | undefined;
  cues?: GasCueId[] | undefined;
  tags?: string[] | undefined;
};

export type GasAttributeModifier = {
  attribute: GasAttributeId;
  operation: "add" | "multiply" | "set";
  value: number;
};

export type GasTagDefinition = {
  id: GasTagId;
  name?: string | undefined;
  tags?: string[] | undefined;
};

export type GasCueDefinition = {
  id: GasCueId;
  type: string;
  payload?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
};

export type GasActorComponentState = {
  actorId: GasActorId;
  definitionId: GasDefinitionId;
  entityId?: EntityId | undefined;
};

export type GasAttributesComponentState = {
  base: Record<GasAttributeId, number>;
  current: Record<GasAttributeId, number>;
};

export type GasTagsComponentState = {
  values: GasTagId[];
};

export type GasAbilitiesComponentState = {
  ids: GasAbilityId[];
  cooldowns: Record<GasAbilityId, number>;
  disabled: GasAbilityId[];
};

export type GasActiveEffectState = {
  id: string;
  effectId: GasEffectId;
  sourceActorId?: GasActorId | undefined;
  targetActorId: GasActorId;
  startedAt: number;
  expiresAt?: number | undefined;
  nextTickAt?: number | undefined;
  grantedTags: GasTagId[];
};

export type GasEffectsComponentState = {
  active: GasActiveEffectState[];
};

export type GasActorRuntimeState = {
  actor: GasActorComponentState;
  attributes: GasAttributesComponentState;
  tags: GasTagsComponentState;
  abilities: GasAbilitiesComponentState;
  effects: GasEffectsComponentState;
};

export type GasActorCreation = {
  actorId?: GasActorId | undefined;
  definitionId: GasDefinitionId;
  entityId?: EntityId | undefined;
  attributes?: Record<GasAttributeId, number> | undefined;
  tags?: GasTagId[] | undefined;
  abilities?: GasAbilityId[] | undefined;
};

export type GasAbilityActivation = {
  actorId: GasActorId;
  abilityId: GasAbilityId;
  targetActorId?: GasActorId | undefined;
};

export type GasAbilityActivationResult =
  | {
      status: "activated";
      actorId: GasActorId;
      abilityId: GasAbilityId;
      targetActorId?: GasActorId | undefined;
      cooldownUntil?: number | undefined;
      paidCosts: GasAttributeCost[];
      appliedEffects: GasEffectApplication[];
    }
  | {
      status: "rejected";
      actorId: GasActorId;
      abilityId: GasAbilityId;
      targetActorId?: GasActorId | undefined;
      reason: string;
    };

export type GasEffectApplication = {
  effectId: GasEffectId;
  targetActorId: GasActorId;
  sourceActorId?: GasActorId | undefined;
};

export type GasAttributeChange = {
  actorId: GasActorId;
  attribute: GasAttributeId;
  previous: number;
  next: number;
  source?: string | undefined;
};

export type GasCueEvent = {
  cueId: GasCueId;
  type: string;
  sourceActorId?: GasActorId | undefined;
  targetActorId?: GasActorId | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type GasTraceEntry = {
  id: string;
  type:
    | "actor.created"
    | "ability.activated"
    | "ability.rejected"
    | "effect.applied"
    | "effect.expired"
    | "attribute.changed"
    | "tag.added"
    | "tag.removed"
    | "cue.emitted";
  timestamp: number;
  actorId?: GasActorId | undefined;
  abilityId?: GasAbilityId | undefined;
  effectId?: GasEffectId | undefined;
  message?: string | undefined;
  details?: Record<string, unknown> | undefined;
};

export type GasTraceSnapshot = {
  entries: GasTraceEntry[];
};

export type GasTraceStore = {
  add(entry: Omit<GasTraceEntry, "id">): GasTraceEntry;
  list(): GasTraceEntry[];
  clear(): void;
  snapshot(): GasTraceSnapshot;
};

export type GasRuntimeSnapshot = {
  actors: GasActorRuntimeState[];
  traces: GasTraceEntry[];
};

export type GasRuntime = {
  readonly traceStore: GasTraceStore;
  createActor(input: GasActorCreation): GasActorRuntimeState;
  hasActor(actorId: GasActorId): boolean;
  getActor(actorId: GasActorId): GasActorRuntimeState;
  actorForEntity(entityId: EntityId): GasActorRuntimeState | undefined;
  activateAbility(input: GasAbilityActivation): GasAbilityActivationResult;
  applyEffect(input: GasEffectApplication): void;
  modifyAttribute(actorId: GasActorId, modifier: GasAttributeModifier, source?: string): void;
  addTag(actorId: GasActorId, tag: GasTagId, source?: string): void;
  removeTag(actorId: GasActorId, tag: GasTagId, source?: string): void;
  update(delta: number, elapsed: number): void;
  snapshot(): GasRuntimeSnapshot;
  dispose(): void;
};

export type CreateGasRuntimeConfig = {
  world: GameWorld;
  dataRegistry: DataRegistry;
  eventBus?: EventBus | undefined;
  traceStore?: GasTraceStore | undefined;
};

export type CreateGasModuleConfig = {
  id?: string | undefined;
  dataRegistry: DataRegistry;
  eventBus?: EventBus | undefined;
  traceStore?: GasTraceStore | undefined;
  onRuntime?: ((runtime: GasRuntime) => void) | undefined;
};

export type CreateGasTcaDefinitionsConfig = {
  runtime: () => GasRuntime | undefined;
};

export type GasTcaDefinitionSet = TcaDefinitionSet;

export type GasModuleInstallContext = GameInstallContext;
