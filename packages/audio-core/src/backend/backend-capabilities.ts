export type AudioBackendCapabilities = {
  pause: boolean;
  seek: boolean;
  fades: boolean;
  scheduledStart: boolean;
  multipleTracks: boolean;
  spatial: boolean;
  multipleListeners: boolean;
  parameters: boolean;
  markers: boolean;
  streaming: boolean;
  authoredObjects: boolean;
};
