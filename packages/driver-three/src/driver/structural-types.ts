export type ThreeVectorTarget = {
  x?: number;
  y?: number;
  z?: number;
  set?(x: number, y: number, z?: number): void;
};

export type ThreeTransformTarget = {
  position?: ThreeVectorTarget;
  rotation?: ThreeVectorTarget;
  scale?: ThreeVectorTarget;
};

export type ThreeUserDataTarget = {
  userData?: Record<string, unknown>;
};

export type ThreeDisposableTarget = {
  dispose?(): void;
};

export type ThreeColorTarget = {
  set?(value: string | number): void;
};

export type ThreeMaterialTarget = ThreeDisposableTarget &
  ThreeUserDataTarget & {
    color?: ThreeColorTarget;
    emissive?: ThreeColorTarget;
    map?: unknown;
    opacity?: number;
    transparent?: boolean;
    visible?: boolean;
    wireframe?: boolean;
    needsUpdate?: boolean;
    clone?(): ThreeMaterialTarget;
  };

export type ThreeMaterialSlot = ThreeMaterialTarget | ThreeMaterialTarget[] | ThreeDisposableTarget;

export type ThreeHierarchyTarget = ThreeUserDataTarget & {
  children?: ThreeObjectTarget[];
  parent?: ThreeObjectTarget | null;
  add?(child: ThreeObjectTarget): void;
  remove?(child: ThreeObjectTarget): void;
  traverse?(visit: (child: ThreeObjectTarget) => void): void;
};

export type ThreeObjectTarget = ThreeTransformTarget &
  ThreeHierarchyTarget &
  ThreeDisposableTarget & {
    type?: string;
    name?: string;
    visible?: boolean;
    frustumCulled?: boolean;
    geometry?: ThreeDisposableTarget;
    material?: ThreeMaterialSlot;
    color?: ThreeColorTarget;
    intensity?: number;
    distance?: number;
    castShadow?: boolean;
    receiveShadow?: boolean;
    isMesh?: boolean;
    isSkinnedMesh?: boolean;
  };

export type ThreeCameraSyncTarget = ThreeObjectTarget & {
  zoom?: number;
  updateProjectionMatrix?(): void;
};
