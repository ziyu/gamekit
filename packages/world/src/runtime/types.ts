import type { ComponentDef } from "../components/component";

export type EntityId = string | number;

export type WorldQuery = {
  components: Array<ComponentDef<any>>;
};

export type WorldSystemContext = {
  world: GameWorld;
  delta: number;
  elapsed: number;
  tick: number;
};

export type WorldSystem = {
  id: string;
  update: (ctx: WorldSystemContext) => void;
};

export type GameWorld = {
  spawn(): EntityId;
  despawn(entity: EntityId): void;
  has(entity: EntityId): boolean;
  add<T extends object>(entity: EntityId, component: ComponentDef<T>, data?: Partial<T>): void;
  get<T extends object>(entity: EntityId, component: ComponentDef<T>): T | undefined;
  set<T extends object>(entity: EntityId, component: ComponentDef<T>, data: Partial<T>): void;
  remove<T extends object>(entity: EntityId, component: ComponentDef<T>): void;
  query(components?: Array<ComponentDef<any>>): EntityId[];
  count(): number;
};
