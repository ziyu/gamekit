export type AnimatorMarkerEvent = {
  id: string;
  controllerId: string;
  layerId: string;
  clipId: string;
  markerId: string;
  timestamp: number;
  generation: number;
  executionId?: string | undefined;
  tags?: string[] | undefined;
};

export function cloneAnimatorMarker(marker: AnimatorMarkerEvent): AnimatorMarkerEvent {
  return {
    ...marker,
    ...(marker.tags === undefined ? {} : { tags: [...marker.tags] })
  };
}
