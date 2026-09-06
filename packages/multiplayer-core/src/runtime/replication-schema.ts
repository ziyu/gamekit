import type {
  MultiplayerClientPredictionReadContext,
  MultiplayerClientReplicationSchemaBinding,
  MultiplayerClientReplicationSnapshotContext
} from "./client-replication";
import {
  defineSnapshotAngleTrack,
  defineSnapshotQuaternionTrack,
  defineSnapshotScalarTrack,
  defineSnapshotStepTrack,
  defineSnapshotVector2Track,
  defineSnapshotVector3Track,
  type NetworkQuaternion,
  type NetworkVector2,
  type NetworkVector3,
  type SnapshotBufferEntry,
  type SnapshotPresentationKey,
  type SnapshotPresentationTrack
} from "./presentation";
import type { MultiplayerMessageEnvelope } from "./types";

export type MultiplayerReplicationIdentity = string | number;

export type MultiplayerReplicationPresentationField<TEntity> =
  | {
      id: string;
      kind: "scalar" | "angle-radians";
      read(entity: TEntity): number;
    }
  | {
      id: string;
      kind: "vector2";
      read(entity: TEntity): NetworkVector2;
      snapDistance?: number | undefined;
    }
  | {
      id: string;
      kind: "vector3";
      read(entity: TEntity): NetworkVector3;
      snapDistance?: number | undefined;
    }
  | {
      id: string;
      kind: "quaternion";
      read(entity: TEntity): NetworkQuaternion;
    }
  | {
      id: string;
      kind: "step";
      read(entity: TEntity): unknown;
      threshold?: number | undefined;
    };

export type MultiplayerReplicationEntityPresentationOptions<TSnapshot, TEntity> = {
  id: string;
  select(snapshot: TSnapshot): Iterable<TEntity>;
  identity(entity: TEntity): MultiplayerReplicationIdentity;
  generation?(entity: TEntity): MultiplayerReplicationIdentity;
  fields: readonly MultiplayerReplicationPresentationField<TEntity>[];
};

export type MultiplayerReplicationEntityPresentation<TSnapshot, TEntity> = {
  readonly id: string;
  readonly tracks: readonly SnapshotPresentationTrack<TSnapshot>[];
  key(fieldId: string, entity: TEntity): SnapshotPresentationKey;
  keyFromIdentity(
    fieldId: string,
    identity: MultiplayerReplicationIdentity,
    generation?: MultiplayerReplicationIdentity
  ): SnapshotPresentationKey;
};

export type MultiplayerReplicationPresentationTracks<TSnapshot> = {
  readonly tracks: readonly SnapshotPresentationTrack<TSnapshot>[];
};

export type MultiplayerReplicationSchemaOptions<TSnapshot, TClientIdentity, TLocalEntity> = {
  id: string;
  version: string;
  decode(payload: unknown, message: MultiplayerMessageEnvelope): TSnapshot | undefined;
  tick(snapshot: TSnapshot): number;
  time?(snapshot: TSnapshot): number | undefined;
  serverTime?(snapshot: TSnapshot): number | undefined;
  snapshotVersion?(snapshot: TSnapshot): string | number | undefined;
  presentation?: readonly MultiplayerReplicationPresentationTracks<TSnapshot>[] | undefined;
  local: {
    select(snapshot: TSnapshot, identity: TClientIdentity): TLocalEntity | undefined;
    acknowledgedSequence?(snapshot: TSnapshot, identity: TClientIdentity): number | undefined;
  };
};

export type MultiplayerReplicationClientBindingOptions<
  TSnapshot,
  TClientIdentity,
  TLocalEntity,
  TState,
  TInstallContext
> = {
  identity(
    context: MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext>
  ): TClientIdentity | undefined;
  state(
    entity: TLocalEntity,
    context: MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext>
  ): TState;
};

export type MultiplayerReplicationSchema<TSnapshot, TClientIdentity, TLocalEntity> = {
  readonly id: string;
  readonly version: string;
  bindClient<TState, TInstallContext = unknown>(
    options: MultiplayerReplicationClientBindingOptions<
      TSnapshot,
      TClientIdentity,
      TLocalEntity,
      TState,
      TInstallContext
    >
  ): MultiplayerClientReplicationSchemaBinding<TSnapshot, TState, TInstallContext>;
};

/**
 * Compiles a typed snapshot/identity/ack declaration into the callbacks consumed by managed
 * client replication. Payload validation remains app-owned and executes once at ingress.
 */
export function defineMultiplayerReplicationSchema<TSnapshot, TClientIdentity, TLocalEntity>(
  options: MultiplayerReplicationSchemaOptions<TSnapshot, TClientIdentity, TLocalEntity>
): MultiplayerReplicationSchema<TSnapshot, TClientIdentity, TLocalEntity> {
  validateSchemaId(options.id, "Replication schema");
  validateSchemaId(options.version, "Replication schema version");
  const tracks = Object.freeze(
    (options.presentation ?? []).flatMap((presentation) => presentation.tracks)
  );

  return Object.freeze({
    id: options.id,
    version: options.version,
    bindClient<TState, TInstallContext = unknown>(
      binding: MultiplayerReplicationClientBindingOptions<
        TSnapshot,
        TClientIdentity,
        TLocalEntity,
        TState,
        TInstallContext
      >
    ): MultiplayerClientReplicationSchemaBinding<TSnapshot, TState, TInstallContext> {
      return {
        id: options.id,
        version: options.version,
        tracks,
        readSnapshot(payload, message) {
          if (message.schemaVersion !== undefined && message.schemaVersion !== options.version) {
            return undefined;
          }
          try {
            const snapshot = options.decode(payload, message);
            return snapshot !== undefined && validTick(options.tick(snapshot))
              ? snapshot
              : undefined;
          } catch {
            return undefined;
          }
        },
        toBufferEntry(context) {
          return createBufferEntry(options, context);
        },
        readAuthoritativeState(context) {
          const identity = binding.identity(context);
          if (identity === undefined) {
            return undefined;
          }
          const entity = options.local.select(context.snapshot, identity);
          return entity === undefined ? undefined : binding.state(entity, context);
        },
        readAcknowledgedSequence(context) {
          const identity = binding.identity(context);
          if (identity === undefined || options.local.acknowledgedSequence === undefined) {
            return undefined;
          }
          const sequence = options.local.acknowledgedSequence(context.snapshot, identity);
          return sequence === undefined || validSequence(sequence) ? sequence : undefined;
        }
      };
    }
  });
}

/** Compiles entity identity and field declarations into stable presentation tracks and keys. */
export function defineMultiplayerReplicationEntityPresentation<TSnapshot, TEntity>(
  options: MultiplayerReplicationEntityPresentationOptions<TSnapshot, TEntity>
): MultiplayerReplicationEntityPresentation<TSnapshot, TEntity> {
  validateSchemaId(options.id, "Replication entity presentation");
  const fieldIds = new Set<string>();
  for (const field of options.fields) {
    validateSchemaId(field.id, "Replication presentation field");
    if (fieldIds.has(field.id)) {
      throw new Error(`Duplicate replication presentation field: ${field.id}`);
    }
    fieldIds.add(field.id);
  }
  const keyFromIdentity = (
    fieldId: string,
    identity: MultiplayerReplicationIdentity,
    generation?: MultiplayerReplicationIdentity
  ): SnapshotPresentationKey => {
    if (!fieldIds.has(fieldId)) {
      throw new Error(`Unknown replication presentation field: ${fieldId}`);
    }
    validateIdentity(identity, "identity");
    if (generation !== undefined) {
      validateIdentity(generation, "generation");
    }
    return framedKey(options.id, fieldId, identity, generation);
  };
  const key = (fieldId: string, entity: TEntity): SnapshotPresentationKey =>
    keyFromIdentity(fieldId, options.identity(entity), options.generation?.(entity));
  const tracks = Object.freeze(
    options.fields.map((field) => createPresentationTrack(options, field, key))
  );

  return Object.freeze({
    id: options.id,
    tracks,
    key,
    keyFromIdentity
  });
}

function createPresentationTrack<TSnapshot, TEntity>(
  options: MultiplayerReplicationEntityPresentationOptions<TSnapshot, TEntity>,
  field: MultiplayerReplicationPresentationField<TEntity>,
  key: (fieldId: string, entity: TEntity) => SnapshotPresentationKey
): SnapshotPresentationTrack<TSnapshot> {
  const selectInto = (
    snapshot: TSnapshot,
    writer: { add(key: SnapshotPresentationKey, value: any): void }
  ): void => {
    for (const entity of options.select(snapshot)) {
      writer.add(key(field.id, entity), field.read(entity));
    }
  };
  switch (field.kind) {
    case "scalar":
      return defineSnapshotScalarTrack({ selectInto });
    case "angle-radians":
      return defineSnapshotAngleTrack({ selectInto });
    case "vector2":
      return defineSnapshotVector2Track({
        selectInto,
        ...(field.snapDistance === undefined ? {} : { snapDistance: field.snapDistance })
      });
    case "vector3":
      return defineSnapshotVector3Track({
        selectInto,
        ...(field.snapDistance === undefined ? {} : { snapDistance: field.snapDistance })
      });
    case "quaternion":
      return defineSnapshotQuaternionTrack({ selectInto });
    case "step":
      return defineSnapshotStepTrack({
        selectInto,
        ...(field.threshold === undefined ? {} : { threshold: field.threshold })
      });
  }
}

function createBufferEntry<TSnapshot, TClientIdentity, TLocalEntity, TInstallContext>(
  options: MultiplayerReplicationSchemaOptions<TSnapshot, TClientIdentity, TLocalEntity>,
  context: MultiplayerClientReplicationSnapshotContext<TSnapshot, TInstallContext>
): SnapshotBufferEntry<TSnapshot> {
  const tick = options.tick(context.snapshot);
  const time = options.time?.(context.snapshot);
  const serverTime = options.serverTime?.(context.snapshot);
  const version = options.snapshotVersion?.(context.snapshot) ?? options.version;
  return {
    snapshot: context.snapshot,
    tick,
    ...(time === undefined || !Number.isFinite(time) ? {} : { time }),
    ...(serverTime === undefined || !Number.isFinite(serverTime) ? {} : { serverTime }),
    version,
    receivedAt: context.message.timestamp
  };
}

function framedKey(
  schemaId: string,
  fieldId: string,
  identity: MultiplayerReplicationIdentity,
  generation: MultiplayerReplicationIdentity | undefined
): string {
  return [schemaId, fieldId, typedIdentity(identity), typedIdentity(generation ?? 0)]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function typedIdentity(identity: MultiplayerReplicationIdentity): string {
  return `${typeof identity}:${String(identity)}`;
}

function validateIdentity(identity: MultiplayerReplicationIdentity, label: string): void {
  if (
    (typeof identity === "string" && identity.trim().length === 0) ||
    (typeof identity === "number" && !Number.isSafeInteger(identity))
  ) {
    throw new Error(`Replication ${label} must be a non-empty string or safe integer.`);
  }
}

function validateSchemaId(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} id must not be empty.`);
  }
}

function validTick(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validSequence(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
