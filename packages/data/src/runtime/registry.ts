import { hasErrorDiagnostics } from "./diagnostics";
import {
  createDataDuplicateTypeError,
  createDataMissingDocumentError,
  createDataMissingTypeError,
  createDataRegistryError
} from "./errors";
import { DataReferenceGraph, dataKeyString } from "./reference-graph";
import type {
  DataDiagnostic,
  DataDocument,
  DataId,
  DataKey,
  DataPack,
  DataPackEntry,
  DataPackValidation,
  DataQuery,
  DataReference,
  DataRegistry,
  DataSnapshot,
  DataTypeContext,
  DataTypeDefinition,
  DataTypeId
} from "./types";

export function createDataRegistry(): DataRegistry {
  const types = new Map<DataTypeId, DataTypeDefinition>();
  const documents = new Map<string, DataDocument>();
  const packs = new Map<string, DataPack>();
  const graph = new DataReferenceGraph();
  const indexes = new Map<string, Set<string>>();

  const requireType = <T = unknown>(type: DataTypeId): DataTypeDefinition<T> => {
    const definition = types.get(type);
    if (!definition) {
      throw createDataMissingTypeError(type);
    }

    return definition as DataTypeDefinition<T>;
  };

  const rebuildIndexes = (): void => {
    indexes.clear();

    for (const document of documents.values()) {
      addDocumentToIndexes(document);
    }
  };

  const addDocumentToIndexes = (document: DataDocument): void => {
    addIndexValue(indexKey("type", document.type), dataKeyString(document));
    addIndexValue(indexKey("sourcePackId", document.sourcePackId ?? ""), dataKeyString(document));
    addIndexValue(indexKey("namespace", document.namespace ?? ""), dataKeyString(document));

    for (const tag of document.tags) {
      addIndexValue(indexKey("tag", tag), dataKeyString(document));
    }

    const definition = types.get(document.type);
    for (const customIndex of definition?.indexes ?? []) {
      for (const value of customIndex.values(document)) {
        addIndexValue(indexKey(customIndex.id, value), dataKeyString(document));
      }
    }
  };

  const materializePack = (pack: DataPack): DataPackValidation => {
    const diagnostics: DataDiagnostic[] = [];
    const nextDocuments: DataDocument[] = [];
    const nextReferences: DataReference[] = [];
    const seenInPack = new Set<string>();
    const entries = normalizePackEntries(pack);

    if (packs.has(pack.id)) {
      diagnostics.push({
        code: "data.duplicate_pack",
        message: `Duplicate data pack: ${pack.id}`,
        severity: "error",
        sourcePackId: pack.id
      });
    }

    entries.forEach((entry, index) => {
      const path = entryPath(index);
      const type = entry.type;
      const definition = types.get(type);
      if (!definition) {
        diagnostics.push({
          code: "data.unknown_type",
          message: `Unknown data type: ${type}`,
          severity: "error",
          path,
          sourcePackId: pack.id,
          details: {
            entryType: type,
            entryId: entry.id
          }
        });
        const lastDiagnostic = diagnostics[diagnostics.length - 1];
        if (entry.id && lastDiagnostic) {
          lastDiagnostic.key = { type, id: entry.id };
        }
        return;
      }

      const context: DataTypeContext = { type, pack, path, entry };
      const normalized = normalizeValue(definition, entry.data, context);
      const id = entry.id;

      if (!id) {
        diagnostics.push({
          code: "data.missing_id",
          message: `Missing id for data document: ${type}`,
          severity: "error",
          path,
          sourcePackId: pack.id,
          details: {
            entryType: type
          }
        });
        return;
      }

      const key: DataKey = { type, id };
      const keyString = dataKeyString(key);
      if (documents.has(keyString) || seenInPack.has(keyString)) {
        diagnostics.push({
          code: "data.duplicate_document",
          message: `Duplicate data document: ${keyString}`,
          severity: "error",
          key,
          path,
          sourcePackId: pack.id,
          details: {
            entryType: type,
            entryId: id
          }
        });
        return;
      }

      seenInPack.add(keyString);
      const document = createDocument(definition, {
        data: normalized,
        pack,
        type,
        id,
        path,
        entry
      });
      nextDocuments.push(document);
      diagnostics.push(...(definition.validate?.(document, context) ?? []));

      for (const reference of definition.references?.(document, context) ?? []) {
        nextReferences.push({
          from: key,
          to: {
            type: reference.type,
            id: reference.id
          },
          path: reference.path,
          sourcePackId: pack.id,
          optional: reference.optional === true
        });
      }
    });

    const availableKeys = new Set([...documents.keys(), ...nextDocuments.map(dataKeyString)]);
    for (const reference of nextReferences) {
      if (!reference.optional && !availableKeys.has(dataKeyString(reference.to))) {
        const diagnostic: DataDiagnostic = {
          code: "data.missing_reference",
          message: `Missing referenced data document: ${dataKeyString(reference.to)}`,
          severity: "error",
          key: reference.from,
          path: reference.path,
          details: {
            entryType: reference.from.type,
            entryId: reference.from.id,
            targetType: reference.to.type,
            targetId: reference.to.id
          }
        };
        if (reference.sourcePackId) {
          diagnostic.sourcePackId = reference.sourcePackId;
        }
        diagnostics.push(diagnostic);
      }
    }

    return {
      diagnostics,
      documents: nextDocuments,
      references: nextReferences
    };
  };

  const getDocument = <T = unknown>(type: DataTypeId, id: DataId): DataDocument<T> => {
    const document = documents.get(dataKeyString({ type, id }));
    if (!document) {
      throw createDataMissingDocumentError(type, id);
    }

    return document as DataDocument<T>;
  };

  return {
    registerType(definition) {
      const normalized = normalizeDefinition(definition);
      if (types.has(normalized.type)) {
        throw createDataDuplicateTypeError(normalized.type);
      }

      types.set(normalized.type, normalized as DataTypeDefinition);
    },
    hasType(type) {
      return types.has(type);
    },
    type(type) {
      return requireType(type);
    },
    types() {
      return [...types.values()];
    },
    validatePack(pack) {
      return materializePack(pack);
    },
    registerPack(pack) {
      const validation = materializePack(pack);
      if (hasErrorDiagnostics(validation.diagnostics)) {
        throw createDataRegistryError(
          "data.invalid_pack",
          `Invalid data pack: ${pack.id}`,
          validation.diagnostics
        );
      }

      packs.set(pack.id, pack);
      for (const document of validation.documents) {
        documents.set(dataKeyString(document), document);
      }
      graph.addMany(validation.references);
      rebuildIndexes();
      return validation;
    },
    has(type, id) {
      return documents.has(dataKeyString({ type, id }));
    },
    get<T = unknown>(type: DataTypeId, id: DataId) {
      return getDocument<T>(type, id);
    },
    getValue<T = unknown>(type: DataTypeId, id: DataId) {
      return getDocument<T>(type, id).data;
    },
    list<T = unknown>(type: DataTypeId) {
      requireType(type);
      return [...documents.values()].filter((document) => document.type === type) as Array<
        DataDocument<T>
      >;
    },
    query<T = unknown>(query: DataQuery) {
      const results = queryDocuments(query, documents, indexes);
      return results as Array<DataDocument<T>>;
    },
    references() {
      return graph.references();
    },
    referencesFrom(key) {
      return graph.referencesFrom(key);
    },
    referencesTo(key) {
      return graph.referencesTo(key);
    },
    snapshot(): DataSnapshot {
      const typeIds = [...types.keys()];
      return {
        types: typeIds,
        packs: [...packs.keys()],
        documents: [...documents.values()],
        references: graph.references()
      };
    },
    clear() {
      documents.clear();
      packs.clear();
      graph.clear();
      indexes.clear();
    }
  };

  function addIndexValue(key: string, documentKey: string): void {
    if (!indexes.has(key)) {
      indexes.set(key, new Set());
    }
    indexes.get(key)!.add(documentKey);
  }
}

function normalizeDefinition<T>(definition: DataTypeDefinition<T>): DataTypeDefinition<T> {
  if (!definition.type) {
    throw createDataMissingTypeError("<unknown>");
  }

  return definition;
}

function normalizePackEntries(pack: DataPack): DataPackEntry[] {
  return pack.entries;
}

function entryPath(index: number): string {
  return `entries[${index}]`;
}

function normalizeValue<T>(
  definition: DataTypeDefinition<T>,
  value: unknown,
  context: DataTypeContext
): T {
  const typed = value as T;
  return definition.normalize?.(typed, context) ?? typed;
}

function createDocument<T>(
  definition: DataTypeDefinition<T>,
  input: {
    data: T;
    pack: DataPack;
    type: DataTypeId;
    id: DataId;
    path: string;
    entry?: DataPackEntry<T>;
  }
): DataDocument<T> {
  const context: DataTypeContext = {
    type: input.type,
    pack: input.pack,
    path: input.path
  };
  if (input.entry) {
    context.entry = input.entry;
  }
  const entry = input.entry;
  const tags = unique([
    ...(definition.getTags?.(input.data, context) ?? readTags(input.data)),
    ...(entry?.tags ?? [])
  ]);
  const document: DataDocument<T> = {
    type: input.type,
    id: input.id,
    data: input.data,
    priority: entry?.priority ?? input.pack.priority ?? 0,
    tags
  };

  if (input.pack.id) {
    document.sourcePackId = input.pack.id;
  }
  const namespace = entry?.namespace ?? input.pack.namespace;
  if (namespace) {
    document.namespace = namespace;
  }

  const metadata = mergeMetadata(
    definition.getMetadata?.(input.data, context) ?? readMetadata(input.data),
    entry?.metadata
  );
  if (metadata) {
    document.metadata = metadata;
  }

  return document;
}

function readTags(value: unknown): string[] {
  if (typeof value !== "object" || value === null || !("tags" in value)) {
    return [];
  }

  const tags = (value as { tags?: unknown }).tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function readMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || !("metadata" in value)) {
    return undefined;
  }

  const metadata = (value as { metadata?: unknown }).metadata;
  return typeof metadata === "object" && metadata !== null
    ? (metadata as Record<string, unknown>)
    : undefined;
}

function mergeMetadata(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }
  return {
    ...base,
    ...override
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function queryDocuments(
  query: DataQuery,
  documents: Map<string, DataDocument>,
  indexes: Map<string, Set<string>>
): DataDocument[] {
  let keys: Set<string> | undefined;

  if (query.type) {
    keys = intersectKeys(keys, indexes.get(indexKey("type", query.type)));
  }
  if (query.sourcePackId) {
    keys = intersectKeys(keys, indexes.get(indexKey("sourcePackId", query.sourcePackId)));
  }
  if (query.namespace) {
    keys = intersectKeys(keys, indexes.get(indexKey("namespace", query.namespace)));
  }
  for (const tag of query.tags ?? []) {
    keys = intersectKeys(keys, indexes.get(indexKey("tag", tag)));
  }
  if (query.index) {
    keys = intersectKeys(keys, indexes.get(indexKey(query.index.id, query.index.value)));
  }

  const source = keys
    ? [...keys].map((key) => documents.get(key)).filter(isDocument)
    : [...documents.values()];
  return source.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return dataKeyString(a).localeCompare(dataKeyString(b));
  });
}

function intersectKeys(
  current: Set<string> | undefined,
  next: Set<string> | undefined
): Set<string> {
  if (!next) {
    return new Set();
  }
  if (!current) {
    return new Set(next);
  }

  return new Set([...current].filter((key) => next.has(key)));
}

function indexKey(indexId: string, value: string): string {
  return `${indexId}:${value}`;
}

function isDocument(document: DataDocument | undefined): document is DataDocument {
  return document !== undefined;
}
