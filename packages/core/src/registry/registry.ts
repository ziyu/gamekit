import { GameError } from "../errors/game-error";

export class Registry<T> {
  private readonly items = new Map<string, T>();

  register(id: string, item: T): void {
    if (this.items.has(id)) {
      throw new GameError("registry.duplicate", `Duplicate registry id: ${id}`, { id });
    }

    this.items.set(id, item);
  }

  get(id: string): T {
    const item = this.items.get(id);
    if (!item) {
      throw new GameError("registry.missing", `Missing registry item: ${id}`, { id });
    }

    return item;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  values(): T[] {
    return [...this.items.values()];
  }

  entries(): Array<[string, T]> {
    return [...this.items.entries()];
  }

  clear(): void {
    this.items.clear();
  }
}
