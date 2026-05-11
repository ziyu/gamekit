import { GameError } from "@gamekit/core";
import { describeDiagnostic } from "./diagnostics";
import type { DataDiagnostic } from "./types";

export class DataRegistryError extends GameError {
  readonly diagnostics: DataDiagnostic[];

  constructor(code: string, message: string, diagnostics: DataDiagnostic[]) {
    super(code, message, { diagnostics });
    this.name = "DataRegistryError";
    this.diagnostics = diagnostics;
  }
}

export function createDataRegistryError(
  code: string,
  message: string,
  diagnostics: DataDiagnostic[]
): DataRegistryError {
  const detail = diagnostics.length > 0 ? ` ${diagnostics.map(describeDiagnostic).join("; ")}` : "";
  return new DataRegistryError(code, `${message}.${detail}`, diagnostics);
}

export function createDataDuplicateKindError(kind: string): GameError {
  return new GameError("data.duplicate_kind", `Duplicate data kind: ${kind}`, { kind });
}

export function createDataMissingKindError(kind: string): GameError {
  return new GameError("data.missing_kind", `Missing data kind: ${kind}`, { kind });
}

export function createDataMissingDocumentError(kind: string, id: string): GameError {
  return new GameError("data.missing_document", `Missing data document: ${kind}:${id}`, {
    kind,
    id
  });
}
