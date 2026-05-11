export type RenderVector3 = {
  x?: number;
  y?: number;
  z?: number;
};

export type RenderTransform = {
  position?: RenderVector3;
  rotation?: RenderVector3;
  scale?: RenderVector3;
  origin?: RenderVector3;
};
