export type ComponentDef<T extends object> = {
  readonly id: string;
  create: (data?: Partial<T>) => T;
};

export type ComponentInput<T extends object> = {
  id: string;
  create: (data?: Partial<T>) => T;
};

export function defineComponent<T extends object>(component: ComponentInput<T>): ComponentDef<T> {
  return {
    id: component.id,
    create: component.create
  };
}
