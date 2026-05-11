import type { DataKey, DataReference } from "./types";

export function dataKeyString(key: DataKey): string {
  return `${key.kind}:${key.id}`;
}

export class DataReferenceGraph {
  private readonly edges: DataReference[] = [];

  add(reference: DataReference): void {
    this.edges.push(reference);
  }

  addMany(references: DataReference[]): void {
    for (const reference of references) {
      this.add(reference);
    }
  }

  references(): DataReference[] {
    return [...this.edges];
  }

  referencesFrom(key: DataKey): DataReference[] {
    const from = dataKeyString(key);
    return this.edges.filter((reference) => dataKeyString(reference.from) === from);
  }

  referencesTo(key: DataKey): DataReference[] {
    const to = dataKeyString(key);
    return this.edges.filter((reference) => dataKeyString(reference.to) === to);
  }

  clear(): void {
    this.edges.length = 0;
  }
}
