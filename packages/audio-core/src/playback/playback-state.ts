import type { ResolvedAudioTrack } from "../catalog/source-definition";
import type { PlaybackInstanceState } from "../contracts/playback";
import type {
  AudioEmitterState,
  AudioListenerState,
  AudioTransform
} from "../spatial/spatial-types";

export function clonePlaybackState(state: PlaybackInstanceState): PlaybackInstanceState {
  return {
    ...state,
    tracks: state.tracks.map(cloneTrack),
    ...(state.transform === undefined ? {} : { transform: cloneTransform(state.transform) }),
    ...(state.spatial === undefined ? {} : { spatial: { ...state.spatial } }),
    parameters: { ...state.parameters },
    tags: [...state.tags]
  };
}

export function cloneTrack(track: ResolvedAudioTrack): ResolvedAudioTrack {
  return { ...track, asset: { ...track.asset } };
}

export function cloneTransform(transform: AudioTransform): AudioTransform {
  return {
    position: { ...transform.position },
    ...(transform.forward === undefined ? {} : { forward: { ...transform.forward } }),
    ...(transform.up === undefined ? {} : { up: { ...transform.up } })
  };
}

export function cloneListener(listener: AudioListenerState): AudioListenerState {
  return { ...listener, transform: cloneTransform(listener.transform) };
}

export function cloneEmitter(emitter: AudioEmitterState): AudioEmitterState {
  return {
    ...emitter,
    transform: cloneTransform(emitter.transform),
    ...(emitter.velocity === undefined ? {} : { velocity: { ...emitter.velocity } })
  };
}
