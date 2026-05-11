export type KootaTrait = unknown;

export type KootaEntity = {
  add: (...traits: any[]) => void;
  remove: (trait: any) => void;
  has: (trait: any) => boolean;
  get: (trait: any) => unknown;
  set: (trait: any, value: unknown) => void;
  destroy: () => void;
};

export type KootaNativeWorld = {
  spawn: (...traits: any[]) => KootaEntity;
  has: (entity: KootaEntity) => boolean;
  query: (...traits: any[]) => KootaEntity[];
};
