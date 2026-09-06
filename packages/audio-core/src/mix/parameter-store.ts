import type { AudioBackend } from "../backend/audio-backend";
import type {
  AudioParameterDefinition,
  AudioParameterValue
} from "../catalog/parameter-definition";
import { createAudioError } from "../contracts/errors";
import { validateParameterValue } from "../catalog/validation";

export type AudioParameterStore = {
  setGlobal(id: string, value: AudioParameterValue): void;
  validateInstance(id: string, value: AudioParameterValue): AudioParameterValue;
  snapshot(): Record<string, AudioParameterValue>;
};

export function createAudioParameterStore(options: {
  definitions: Map<string, AudioParameterDefinition>;
  initial: Record<string, AudioParameterValue>;
  backend: AudioBackend;
}): AudioParameterStore {
  const globalValues = { ...options.initial };
  return {
    setGlobal(id, value) {
      const definition = requireParameter(options.definitions, id, "global");
      const resolved = validateParameterValue(definition, value);
      globalValues[id] = resolved;
      options.backend.setGlobalParameter(id, resolved);
    },
    validateInstance(id, value) {
      return validateParameterValue(requireParameter(options.definitions, id, "instance"), value);
    },
    snapshot: () => ({ ...globalValues })
  };
}

function requireParameter(
  definitions: Map<string, AudioParameterDefinition>,
  id: string,
  scope: "global" | "instance"
): AudioParameterDefinition {
  const definition = definitions.get(id);
  if (definition === undefined || definition.scope !== scope) {
    throw createAudioError(
      "audio.parameter_missing",
      `Audio ${scope} parameter is missing: ${id}`,
      {
        parameterId: id
      }
    );
  }
  return definition;
}
