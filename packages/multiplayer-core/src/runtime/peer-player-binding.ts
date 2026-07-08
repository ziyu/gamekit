import { createMultiplayerError, multiplayerErrorCodes } from "./errors";
import type { MultiplayerPeer, MultiplayerPeerRole } from "./types";

export type MultiplayerPeerPlayerBindingStatus =
  | "active"
  | "disconnected"
  | "left"
  | "spectator"
  | "closed";

export type MultiplayerPeerPlayerBinding = {
  peerId: string;
  playerId: string;
  status: MultiplayerPeerPlayerBindingStatus;
  displayName?: string;
  role?: MultiplayerPeerRole;
  slot?: string | number;
  metadata?: Record<string, unknown>;
  reason?: string;
};

export type MultiplayerPeerPlayerBindingInput = {
  playerId?: string;
  displayName?: string;
  role?: MultiplayerPeerRole;
  status?: MultiplayerPeerPlayerBindingStatus;
  slot?: string | number;
  metadata?: Record<string, unknown>;
};

export type MultiplayerPeerPlayerLeaveOptions = {
  status?: Extract<MultiplayerPeerPlayerBindingStatus, "disconnected" | "left" | "spectator">;
  remove?: boolean;
  reason?: string;
};

export type CreateMultiplayerPeerPlayerBindingStoreOptions = {
  defaultDisplayName?: string;
  maxDisplayNameLength?: number;
  displayNameFallback?(peer: MultiplayerPeer, index: number): string;
  normalizeDisplayName?(value: string | undefined, fallback: string): string;
  duplicateNameSuffix?(baseName: string, index: number): string;
};

export type MultiplayerPeerPlayerBindingStore = {
  bindPeer(
    peer: MultiplayerPeer,
    input?: MultiplayerPeerPlayerBindingInput
  ): MultiplayerPeerPlayerBinding;
  markPeerLeft(
    peerId: string,
    options?: MultiplayerPeerPlayerLeaveOptions
  ): MultiplayerPeerPlayerBinding | undefined;
  removePeer(peerId: string): MultiplayerPeerPlayerBinding | undefined;
  bindingForPeer(peerId: string): MultiplayerPeerPlayerBinding | undefined;
  playerIdForPeer(peerId: string): string | undefined;
  bindings(): MultiplayerPeerPlayerBinding[];
  activeBindings(): MultiplayerPeerPlayerBinding[];
  close(reason?: string): MultiplayerPeerPlayerBinding[];
};

type InternalBinding = MultiplayerPeerPlayerBinding;

const DEFAULT_DISPLAY_NAME = "Player";
const DEFAULT_DISPLAY_NAME_LENGTH = 32;

export function createMultiplayerPeerPlayerBindingStore(
  options: CreateMultiplayerPeerPlayerBindingStoreOptions = {}
): MultiplayerPeerPlayerBindingStore {
  const byPlayerId = new Map<string, InternalBinding>();
  const peerToPlayer = new Map<string, string>();
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw createMultiplayerError(
        multiplayerErrorCodes.closedBinding,
        "Peer/player binding store is closed."
      );
    }
  }

  function bindPeer(
    peer: MultiplayerPeer,
    input: MultiplayerPeerPlayerBindingInput = {}
  ): MultiplayerPeerPlayerBinding {
    assertOpen();

    const previousPlayerId = peerToPlayer.get(peer.id);
    const playerId = input.playerId ?? peer.playerId ?? previousPlayerId ?? peer.id;
    const existing = byPlayerId.get(playerId);
    const status = input.status ?? statusFromPeer(peer);
    const displayName = resolveDisplayName(peer, input, playerId);
    const role = input.role ?? peer.role;
    const slot = input.slot ?? existing?.slot;

    if (previousPlayerId && previousPlayerId !== playerId) {
      byPlayerId.delete(previousPlayerId);
    }

    if (existing && existing.peerId !== peer.id) {
      peerToPlayer.delete(existing.peerId);
    }

    const binding: InternalBinding = {
      peerId: peer.id,
      playerId,
      status,
      ...(displayName === undefined ? {} : { displayName }),
      ...(role === undefined ? {} : { role }),
      ...(slot === undefined ? {} : { slot }),
      ...(peer.metadata === undefined && input.metadata === undefined
        ? {}
        : { metadata: { ...peer.metadata, ...input.metadata } })
    };

    byPlayerId.set(playerId, binding);
    peerToPlayer.set(peer.id, playerId);
    return cloneBinding(binding);
  }

  function markPeerLeft(
    peerId: string,
    leaveOptions: MultiplayerPeerPlayerLeaveOptions = {}
  ): MultiplayerPeerPlayerBinding | undefined {
    assertOpen();

    const playerId = peerToPlayer.get(peerId);
    if (!playerId) {
      return undefined;
    }

    const current = byPlayerId.get(playerId);
    if (!current) {
      peerToPlayer.delete(peerId);
      return undefined;
    }

    peerToPlayer.delete(peerId);
    const status = leaveOptions.status ?? "left";
    const updated: InternalBinding = {
      ...current,
      status,
      ...(leaveOptions.reason === undefined ? {} : { reason: leaveOptions.reason })
    };

    if (leaveOptions.remove) {
      byPlayerId.delete(playerId);
      return cloneBinding(updated);
    }

    byPlayerId.set(playerId, updated);
    return cloneBinding(updated);
  }

  function removePeer(peerId: string): MultiplayerPeerPlayerBinding | undefined {
    assertOpen();

    const playerId = peerToPlayer.get(peerId);
    if (!playerId) {
      return undefined;
    }

    peerToPlayer.delete(peerId);
    const current = byPlayerId.get(playerId);
    if (!current) {
      return undefined;
    }

    byPlayerId.delete(playerId);
    return cloneBinding(current);
  }

  function resolveDisplayName(
    peer: MultiplayerPeer,
    input: MultiplayerPeerPlayerBindingInput,
    playerId: string
  ): string | undefined {
    const fallback = options.displayNameFallback?.(peer, byPlayerId.size + 1) ?? fallbackName(peer);
    const raw = input.displayName ?? peer.displayName;
    const normalize =
      options.normalizeDisplayName ??
      ((value: string | undefined, fallbackValue: string) =>
        normalizeMultiplayerDisplayName(
          value,
          fallbackValue,
          options.maxDisplayNameLength ?? DEFAULT_DISPLAY_NAME_LENGTH
        ));
    const baseName = normalize(raw, fallback);
    if (!baseName) {
      return undefined;
    }

    const takenNames = Array.from(byPlayerId.entries())
      .filter(([existingPlayerId]) => existingPlayerId !== playerId)
      .map(([, binding]) => binding.displayName)
      .filter((name): name is string => Boolean(name));

    return createUniqueMultiplayerDisplayName(baseName, takenNames, options.duplicateNameSuffix);
  }

  return {
    bindPeer,
    markPeerLeft,
    removePeer,
    bindingForPeer(peerId) {
      const playerId = peerToPlayer.get(peerId);
      const binding = playerId ? byPlayerId.get(playerId) : undefined;
      return binding ? cloneBinding(binding) : undefined;
    },
    playerIdForPeer(peerId) {
      return peerToPlayer.get(peerId);
    },
    bindings() {
      return Array.from(byPlayerId.values()).map(cloneBinding);
    },
    activeBindings() {
      return Array.from(byPlayerId.values())
        .filter((binding) => binding.status === "active")
        .map(cloneBinding);
    },
    close(reason) {
      closed = true;
      peerToPlayer.clear();
      for (const [playerId, binding] of byPlayerId.entries()) {
        byPlayerId.set(playerId, {
          ...binding,
          status: "closed",
          ...(reason === undefined ? {} : { reason })
        });
      }

      return Array.from(byPlayerId.values()).map(cloneBinding);
    }
  };
}

export function normalizeMultiplayerDisplayName(
  value: string | undefined,
  fallback = DEFAULT_DISPLAY_NAME,
  maxLength = DEFAULT_DISPLAY_NAME_LENGTH
): string {
  const normalized = (value ?? fallback).trim().replace(/\s+/g, " ");
  const safeName = normalized.length > 0 ? normalized : fallback.trim();
  return safeName.slice(0, Math.max(1, maxLength));
}

export function createUniqueMultiplayerDisplayName(
  baseName: string,
  takenNames: Iterable<string>,
  suffix: (baseName: string, index: number) => string = (name, index) => `${name} ${index}`
): string {
  const taken = new Set(
    Array.from(takenNames, (name) => normalizeMultiplayerDisplayName(name, name))
  );

  if (!taken.has(baseName)) {
    return baseName;
  }

  let index = 2;
  let candidate = suffix(baseName, index);
  while (taken.has(candidate)) {
    index += 1;
    candidate = suffix(baseName, index);
  }

  return candidate;
}

function statusFromPeer(peer: MultiplayerPeer): MultiplayerPeerPlayerBindingStatus {
  if (peer.role === "spectator") {
    return "spectator";
  }

  if (peer.status === "disconnected" || peer.status === "left") {
    return peer.status;
  }

  return "active";
}

function fallbackName(peer: MultiplayerPeer): string {
  return peer.id ? `${DEFAULT_DISPLAY_NAME} ${peer.id}` : DEFAULT_DISPLAY_NAME;
}

function cloneBinding(binding: InternalBinding): MultiplayerPeerPlayerBinding {
  return {
    peerId: binding.peerId,
    playerId: binding.playerId,
    status: binding.status,
    ...(binding.displayName === undefined ? {} : { displayName: binding.displayName }),
    ...(binding.role === undefined ? {} : { role: binding.role }),
    ...(binding.slot === undefined ? {} : { slot: binding.slot }),
    ...(binding.metadata === undefined ? {} : { metadata: { ...binding.metadata } }),
    ...(binding.reason === undefined ? {} : { reason: binding.reason })
  };
}
