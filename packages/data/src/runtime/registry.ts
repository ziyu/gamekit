import { hasErrorDiagnostics } from "./diagnostics";
import {
  createDataDuplicateKindError,
  createDataMissingDocumentError,
  createDataMissingKindError,
  createDataRegistryError
} from "./errors";
import { DataReferenceGraph, dataKeyString } from "./reference-graph";
import type {
  DataDiagnostic,
  DataDocument,
  DataId,
  DataKey,
  DataKind,
  DataKindContext,
  DataKindDefinition,
  DataPack,
  DataPackValidation,
  DataQuery,
  DataReference,
  DataRegistry,
  DataSnapshot
} from "./types";

export function createDataRegistry(): DataRegistry {
  const kinds = new Map<DataKind, DataKindDefinition>();
  const documents = new Map<string, DataDocument>();
  const packs = new Map<string, DataPack>();
  const graph = new DataReferenceGraph();
  const indexes = new Map<string, Set<string>>();

  const requireKind = <T = unknown>(kind: DataKind): DataKindDefinition<T> => {
    const definition = kinds.get(kind);
    if (!definition) {
      throw createDataMissingKindError(kind);
    }

    return definition as DataKindDefinition<T>;
  };

  const rebuildIndexes = (): void => {
    indexes.clear();

    for (const document of documents.values()) {
      addDocumentToIndexes(document);
    }
  };

  const addDocumentToIndexes = (document: DataDocument): void => {
    addIndexValue(indexKey("kind", document.kind), dataKeyString(document));
    addIndexValue(indexKey("sourcePackId", document.sourcePackId ?? ""), dataKeyString(document));
    addIndexValue(indexKey("namespace", document.namespace ?? ""), dataKeyString(document));

    for (const tag of document.tags) {
      addIndexValue(indexKey("tag", tag), dataKeyString(document));
    }

    const definition = kinds.get(document.kind);
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

    if (packs.has(pack.id)) {
      diagnostics.push({
        code: "data.duplicate_pack",
        message: `Duplicate data pack: ${pack.id}`,
        severity: "error",
        sourcePackId: pack.id
      });
    }

    for (const [kind, values] of Object.entries(pack.data)) {
      const definition = kinds.get(kind);
      if (!definition) {
        diagnostics.push({
          code: "data.unknown_kind",
          message: `Unknown data kind: ${kind}`,
          severity: "error",
          path: `data.${kind}`,
          sourcePackId: pack.id
        });
        continue;
      }

      values.forEach((rawValue, index) => {
        const path = `data.${kind}[${index}]`;
        const context: DataKindContext = { kind, pack, path };
        const normalized = normalizeValue(definition, rawValue, context);
        const id = readDocumentId(definition, normalized, context);

        if (!id) {
          diagnostics.push({
            code: "data.missing_id",
            message: `Missing id for data document: ${kind}`,
            severity: "error",
            path,
            sourcePackId: pack.id
          });
          return;
        }

        const key: DataKey = { kind, id };
        const keyString = dataKeyString(key);
        if (documents.has(keyString) || seenInPack.has(keyString)) {
          diagnostics.push({
            code: "data.duplicate_document",
            message: `Duplicate data document: ${keyString}`,
            severity: "error",
            key,
            path,
            sourcePackId: pack.id
          });
          return;
        }

        seenInPack.add(keyString);
        const document = createDocument(definition, {
          value: normalized,
          pack,
          kind,
          path
        });
        nextDocuments.push(document);
        diagnostics.push(...(definition.validate?.(document, context) ?? []));

        for (const reference of definition.references?.(document, context) ?? []) {
          nextReferences.push({
            from: key,
            to: {
              kind: reference.kind,
              id: reference.id
            },
            path: reference.path,
            sourcePackId: pack.id,
            optional: reference.optional === true
          });
        }
      });
    }

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
            targetKind: reference.to.kind,
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

  const getDocument = <T = unknown>(kind: DataKind, id: DataId): DataDocument<T> => {
    const document = documents.get(dataKeyString({ kind, id }));
    if (!document) {
      throw createDataMissingDocumentError(kind, id);
    }

    return document as DataDocument<T>;
  };

  return {
    registerKind(definition) {
      if (kinds.has(definition.kind)) {
        throw createDataDuplicateKindError(definition.kind);
      }

      kinds.set(definition.kind, definition as DataKindDefinition);
    },
    hasKind(kind) {
      return kinds.has(kind);
    },
    kind(kind) {
      return requireKind(kind);
    },
    kinds() {
      return [...kinds.values()];
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
    has(kind, id) {
      return documents.has(dataKeyString({ kind, id }));
    },
    get<T = unknown>(kind: DataKind, id: DataId) {
      return getDocument<T>(kind, id);
    },
    getValue<T = unknown>(kind: DataKind, id: DataId) {
      return getDocument<T>(kind, id).value;
    },
    list<T = unknown>(kind: DataKind) {
      requireKind(kind);
      return [...documents.values()].filter((document) => document.kind === kind) as Array<
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
      return {
        kinds: [...kinds.keys()],
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

function normalizeValue<T>(
  definition: DataKindDefinition<T>,
  value: unknown,
  context: DataKindContext
): T {
  const typed = value as T;
  return definition.normalize?.(typed, context) ?? typed;
}

function readDocumentId<T>(
  definition: DataKindDefinition<T>,
  value: T,
  context: DataKindContext
): DataId | undefined {
  const explicit = definition.getId?.(value, context);
  if (explicit) {
    return explicit;
  }

  return typeof value === "object" && value !== null && "id" in value
    ? String((value as { id?: unknown }).id ?? "")
    : undefined;
}

function createDocument<T>(
  definition: DataKindDefinition<T>,
  input: {
    value: T;
    pack: DataPack;
    kind: DataKind;
    path: string;
  }
): DataDocument<T> {
  const context: DataKindContext = {
    kind: input.kind,
    pack: input.pack,
    path: input.path
  };
  const id = readDocumentId(definition, input.value, context)!;
  const document: DataDocument<T> = {
    kind: input.kind,
    id,
    value: input.value,
    priority: input.pack.priority ?? 0,
    tags: definition.getTags?.(input.value, context) ?? readTags(input.value)
  };

  if (input.pack.id) {
    document.sourcePackId = input.pack.id;
  }
  if (input.pack.namespace) {
    document.namespace = input.pack.namespace;
  }

  const metadata = definition.getMetadata?.(input.value, context) ?? readMetadata(input.value);
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

function queryDocuments(
  query: DataQuery,
  documents: Map<string, DataDocument>,
  indexes: Map<string, Set<string>>
): DataDocument[] {
  let keys: Set<string> | undefined;

  if (query.kind) {
    keys = intersectKeys(keys, indexes.get(indexKey("kind", query.kind)));
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
