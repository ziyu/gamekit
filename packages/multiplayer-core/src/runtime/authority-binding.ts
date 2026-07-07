import type { MultiplayerAuthorityDecision, MultiplayerMessageEnvelope } from "./types";
import type {
  MultiplayerAuthorityBinding,
  MultiplayerAuthorityBindingInput,
  MultiplayerAuthorityBindingStore,
  MultiplayerAuthorityBindingUpdate,
  MultiplayerAuthorityEndpoint
} from "./authority-types";

const ACCEPTED: MultiplayerAuthorityDecision = { allowed: true };

export function createMultiplayerAuthorityBindingStore(
  input: MultiplayerAuthorityBindingInput
): MultiplayerAuthorityBindingStore {
  let binding = createBinding(input);

  return {
    current() {
      return cloneBinding(binding);
    },
    bind(nextInput) {
      binding = createBinding(nextInput);
      return cloneBinding(binding);
    },
    update(update) {
      binding = mergeBinding(binding, update);
      return cloneBinding(binding);
    },
    reject(reason) {
      binding = mergeBinding(binding, {
        status: "rejected",
        reason
      });
      return cloneBinding(binding);
    },
    close(reason) {
      binding = mergeBinding(binding, {
        status: "closed",
        ...(reason === undefined ? {} : { reason })
      });
      return cloneBinding(binding);
    },
    acceptsMessage(message) {
      return acceptsAuthorityMessage(binding, message);
    }
  };
}

export function acceptsAuthorityMessage(
  binding: MultiplayerAuthorityBinding,
  message: MultiplayerMessageEnvelope
): MultiplayerAuthorityDecision {
  if (binding.status !== "bound" && binding.status !== "resyncing") {
    return reject("authority-not-bound", `Authority binding is not ready: ${binding.status}.`);
  }

  if (message.sessionId !== binding.sessionId) {
    return reject("session-mismatch", `Authority message session mismatch: ${message.sessionId}.`);
  }

  if (!binding.authorityPeerId) {
    return reject(
      "missing-authority-peer",
      "Authority binding does not declare an authority peer."
    );
  }

  if (message.sourcePeerId !== binding.authorityPeerId) {
    return reject(
      "non-authority-source",
      `Rejected non-authority source: ${message.sourcePeerId}.`
    );
  }

  return ACCEPTED;
}

export function cloneAuthorityBinding(
  binding: MultiplayerAuthorityBinding
): MultiplayerAuthorityBinding {
  return cloneBinding(binding);
}

function createBinding(input: MultiplayerAuthorityBindingInput): MultiplayerAuthorityBinding {
  return {
    sessionId: input.sessionId,
    mode: input.mode,
    status: input.status ?? "bound",
    ...(input.authorityEndpoint === undefined
      ? {}
      : { authorityEndpoint: cloneEndpoint(input.authorityEndpoint) }),
    ...(input.authorityPeerId === undefined ? {} : { authorityPeerId: input.authorityPeerId }),
    ...(input.localPlayerId === undefined ? {} : { localPlayerId: input.localPlayerId }),
    ...(input.tick === undefined ? {} : { tick: input.tick }),
    ...(input.snapshotVersion === undefined ? {} : { snapshotVersion: input.snapshotVersion }),
    ...(input.reason === undefined ? {} : { reason: input.reason })
  };
}

function mergeBinding(
  current: MultiplayerAuthorityBinding,
  update: MultiplayerAuthorityBindingUpdate
): MultiplayerAuthorityBinding {
  return {
    sessionId: update.sessionId ?? current.sessionId,
    mode: update.mode ?? current.mode,
    status: update.status ?? current.status,
    ...(update.authorityEndpoint === undefined
      ? current.authorityEndpoint === undefined
        ? {}
        : { authorityEndpoint: cloneEndpoint(current.authorityEndpoint) }
      : { authorityEndpoint: cloneEndpoint(update.authorityEndpoint) }),
    ...(update.authorityPeerId === undefined
      ? current.authorityPeerId === undefined
        ? {}
        : { authorityPeerId: current.authorityPeerId }
      : { authorityPeerId: update.authorityPeerId }),
    ...(update.localPlayerId === undefined
      ? current.localPlayerId === undefined
        ? {}
        : { localPlayerId: current.localPlayerId }
      : { localPlayerId: update.localPlayerId }),
    ...(update.tick === undefined
      ? current.tick === undefined
        ? {}
        : { tick: current.tick }
      : { tick: update.tick }),
    ...(update.snapshotVersion === undefined
      ? current.snapshotVersion === undefined
        ? {}
        : { snapshotVersion: current.snapshotVersion }
      : { snapshotVersion: update.snapshotVersion }),
    ...(update.reason === undefined
      ? current.reason === undefined
        ? {}
        : { reason: current.reason }
      : { reason: update.reason })
  };
}

function cloneBinding(binding: MultiplayerAuthorityBinding): MultiplayerAuthorityBinding {
  return {
    sessionId: binding.sessionId,
    mode: binding.mode,
    status: binding.status,
    ...(binding.authorityEndpoint === undefined
      ? {}
      : { authorityEndpoint: cloneEndpoint(binding.authorityEndpoint) }),
    ...(binding.authorityPeerId === undefined ? {} : { authorityPeerId: binding.authorityPeerId }),
    ...(binding.localPlayerId === undefined ? {} : { localPlayerId: binding.localPlayerId }),
    ...(binding.tick === undefined ? {} : { tick: binding.tick }),
    ...(binding.snapshotVersion === undefined ? {} : { snapshotVersion: binding.snapshotVersion }),
    ...(binding.reason === undefined ? {} : { reason: binding.reason })
  };
}

function cloneEndpoint(endpoint: MultiplayerAuthorityEndpoint): MultiplayerAuthorityEndpoint {
  return {
    kind: endpoint.kind,
    id: endpoint.id,
    ...(endpoint.peerId === undefined ? {} : { peerId: endpoint.peerId })
  };
}

function reject(code: string, reason: string): MultiplayerAuthorityDecision {
  return {
    allowed: false,
    code,
    reason
  };
}
