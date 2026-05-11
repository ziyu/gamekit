export type DataKind = string;
export type DataId = string;

export type DataKey = {
  kind: DataKind;
  id: DataId;
};

export type DataDiagnosticSeverity = "error" | "warning" | "info";

export type DataDiagnostic = {
  code: string;
  message: string;
  severity: DataDiagnosticSeverity;
  key?: DataKey;
  path?: string;
  sourcePackId?: string;
  details?: Record<string, unknown>;
};

export type DataPack = {
  id: string;
  version: string;
  namespace?: string;
  priority?: number;
  data: Record<DataKind, unknown[]>;
  patches?: unknown[];
  metadata?: Record<string, unknown>;
};

export type DataDocument<T = unknown> = {
  kind: DataKind;
  id: DataId;
  value: T;
  sourcePackId?: string;
  namespace?: string;
  priority: number;
  tags: string[];
  metadata?: Record<string, unknown>;
};

export type DataDocumentInput<T> = {
  value: T;
  pack: DataPack;
  kind: DataKind;
  path: string;
};

export type DataKindContext = {
  kind: DataKind;
  pack: DataPack;
  path: string;
};

export type DataValidator<T> = (
  document: DataDocument<T>,
  context: DataKindContext
) => DataDiagnostic[];

export type DataNormalizer<T> = (value: T, context: DataKindContext) => T;

export type DataReferenceTarget = {
  kind: DataKind;
  id: DataId;
  path: string;
  optional?: boolean;
};

export type DataReference = {
  from: DataKey;
  to: DataKey;
  path: string;
  sourcePackId?: string;
  optional: boolean;
};

export type DataReferenceExtractor<T> = (
  document: DataDocument<T>,
  context: DataKindContext
) => DataReferenceTarget[];

export type DataIndexDefinition<T> = {
  id: string;
  values(document: DataDocument<T>): string[];
};

export type DataKindDefinition<T = unknown> = {
  kind: DataKind;
  getId?: (value: T, context: DataKindContext) => DataId | undefined;
  getTags?: (value: T, context: DataKindContext) => string[];
  getMetadata?: (value: T, context: DataKindContext) => Record<string, unknown> | undefined;
  normalize?: DataNormalizer<T>;
  validate?: DataValidator<T>;
  references?: DataReferenceExtractor<T>;
  indexes?: Array<DataIndexDefinition<T>>;
};

export type DataQuery = {
  kind?: DataKind;
  tags?: string[];
  sourcePackId?: string;
  namespace?: string;
  index?: {
    id: string;
    value: string;
  };
};

export type DataSnapshot = {
  kinds: DataKind[];
  packs: string[];
  documents: Array<DataDocument>;
  references: DataReference[];
};

export type DataPackValidation = {
  diagnostics: DataDiagnostic[];
  documents: Array<DataDocument>;
  references: DataReference[];
};

export type DataRegistry = {
  registerKind<T>(definition: DataKindDefinition<T>): void;
  hasKind(kind: DataKind): boolean;
  kind<T = unknown>(kind: DataKind): DataKindDefinition<T>;
  kinds(): Array<DataKindDefinition>;
  registerPack(pack: DataPack): DataPackValidation;
  validatePack(pack: DataPack): DataPackValidation;
  has(kind: DataKind, id: DataId): boolean;
  get<T = unknown>(kind: DataKind, id: DataId): DataDocument<T>;
  getValue<T = unknown>(kind: DataKind, id: DataId): T;
  list<T = unknown>(kind: DataKind): Array<DataDocument<T>>;
  query<T = unknown>(query: DataQuery): Array<DataDocument<T>>;
  references(): DataReference[];
  referencesFrom(key: DataKey): DataReference[];
  referencesTo(key: DataKey): DataReference[];
  snapshot(): DataSnapshot;
  clear(): void;
};
