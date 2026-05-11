import type { DataDiagnostic } from "./types";

export function hasErrorDiagnostics(diagnostics: DataDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function describeDiagnostic(diagnostic: DataDiagnostic): string {
  const at = diagnostic.path ? ` at ${diagnostic.path}` : "";
  return `${diagnostic.code}${at}: ${diagnostic.message}`;
}
