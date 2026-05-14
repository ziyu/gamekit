export type DataTypeId = string;
export type DataId = string;

export type DataKey = {
  type: DataTypeId;
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
  entries: DataPackEntry[];
  dependencies?: unknown[];
  patches?: unknown[];
  metadata?: Record<string, unknown>;
};

export type DataPackEntry<T = unknown> = {
  type: DataTypeId;
  id: DataId;
  data: T;
  namespace?: string;
  priority?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type DataDocument<T = unknown> = {
  type: DataTypeId;
  id: DataId;
  data: T;
  sourcePackId?: string;
  namespace?: string;
  priority: number;
  tags: string[];
  metadata?: Record<string, unknown>;
};

export type DataDocumentInput<T> = {
  data: T;
  pack: DataPack;
  type: DataTypeId;
  path: string;
  entry?: DataPackEntry<T>;
};

export type DataTypeContext = {
  type: DataTypeId;
  pack: DataPack;
  path: string;
  entry?: DataPackEntry;
};

export type DataValidator<T> = (
  document: DataDocument<T>,
  context: DataTypeContext
) => DataDiagnostic[];

export type DataNormalizer<T> = (value: T, context: DataTypeContext) => T;

export type DataReferenceTarget = {
  type: DataTypeId;
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
  context: DataTypeContext
) => DataReferenceTarget[];

export type DataIndexDefinition<T> = {
  id: string;
  values(document: DataDocument<T>): string[];
};

export type DataTypeDefinition<T = unknown> = {
  type: DataTypeId;
  getTags?: (value: T, context: DataTypeContext) => string[];
  getMetadata?: (value: T, context: DataTypeContext) => Record<string, unknown> | undefined;
  normalize?: DataNormalizer<T>;
  validate?: DataValidator<T>;
  references?: DataReferenceExtractor<T>;
  indexes?: Array<DataIndexDefinition<T>>;
  metadata?: Record<string, unknown>;
};

export type DataQuery = {
  type?: DataTypeId;
  tags?: string[];
  sourcePackId?: string;
  namespace?: string;
  index?: {
    id: string;
    value: string;
  };
};

export type DataSnapshot = {
  types: DataTypeId[];
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
  registerType<T>(definition: DataTypeDefinition<T>): void;
  hasType(type: DataTypeId): boolean;
  type<T = unknown>(type: DataTypeId): DataTypeDefinition<T>;
  types(): Array<DataTypeDefinition>;
  registerPack(pack: DataPack): DataPackValidation;
  validatePack(pack: DataPack): DataPackValidation;
  has(type: DataTypeId, id: DataId): boolean;
  get<T = unknown>(type: DataTypeId, id: DataId): DataDocument<T>;
  getValue<T = unknown>(type: DataTypeId, id: DataId): T;
  list<T = unknown>(type: DataTypeId): Array<DataDocument<T>>;
  query<T = unknown>(query: DataQuery): Array<DataDocument<T>>;
  references(): DataReference[];
  referencesFrom(key: DataKey): DataReference[];
  referencesTo(key: DataKey): DataReference[];
  snapshot(): DataSnapshot;
  clear(): void;
};

export type DataRef<TType extends DataTypeId = DataTypeId> = {
  type: TType;
  id: DataId;
};

export type ExternalDataReference = {
  category: "data" | "asset" | "custom";
  target: string;
  path?: string;
  metadata?: Record<string, unknown>;
};
