import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import { createMultiplayerRuntime, type MultiplayerRuntime } from "@gamekit/multiplayer-core";

import { OUTPOST_BROWSER_CONFIG_PATH } from "./browser-protocol";

export type OutpostBrowserServerConfig = {
  endpoint: string;
  roomName: string;
};

export type OutpostBrowserIdentity = {
  peerId: string;
  playerId: string;
  displayName: string;
};

export type OutpostBrowserSessionIntent =
  | { kind: "create"; sessionId: string; displayName: string }
  | { kind: "join"; sessionId: string; displayName: string };

export async function loadOutpostBrowserServerConfig(
  fetcher: typeof fetch = fetch
): Promise<OutpostBrowserServerConfig> {
  const response = await fetcher(OUTPOST_BROWSER_CONFIG_PATH, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(
      `Outpost multiplayer server is unavailable (${response.status}). Start the app with corepack pnpm dev:outpost.`
    );
  }
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    !nonEmptyString(payload.endpoint) ||
    !nonEmptyString(payload.roomName)
  ) {
    throw new Error("Outpost multiplayer server returned an invalid connection config.");
  }
  const endpoint = new URL(payload.endpoint);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error(`Unsupported Outpost multiplayer endpoint: ${endpoint.protocol}`);
  }
  return { endpoint: endpoint.toString().replace(/\/$/, ""), roomName: payload.roomName };
}

export function createOutpostBrowserIdentity(displayName: string): OutpostBrowserIdentity {
  const suffix = createIdentitySuffix();
  const peerId = `ranger-${suffix}`;
  return {
    peerId,
    playerId: `player.${peerId}`,
    displayName: normalizeOutpostDisplayName(displayName)
  };
}

export function createOutpostBrowserMultiplayer(
  config: OutpostBrowserServerConfig,
  identity: OutpostBrowserIdentity
): MultiplayerRuntime {
  return createMultiplayerRuntime({
    id: `outpost.browser.${identity.peerId}`,
    backend: createColyseusMultiplayerBackend({
      id: `outpost.browser.colyseus.${identity.peerId}`,
      endpoint: config.endpoint,
      roomName: config.roomName,
      joinByIdFallback: true
    }),
    connectContext: {
      localPeer: {
        id: identity.peerId,
        playerId: identity.playerId,
        displayName: identity.displayName,
        role: "client"
      }
    }
  });
}

export async function enterOutpostBrowserSession(
  runtime: MultiplayerRuntime,
  intent: OutpostBrowserSessionIntent,
  identity: OutpostBrowserIdentity
): Promise<void> {
  const sessionId = normalizeOutpostSessionId(intent.sessionId);
  const localPeer = {
    id: identity.peerId,
    playerId: identity.playerId,
    displayName: identity.displayName,
    role: intent.kind === "create" ? "host" : "client"
  };
  if (intent.kind === "create") {
    await runtime.createSession({
      id: sessionId,
      kind: "private",
      authority: "server-authoritative",
      localPeer
    });
    return;
  }
  await runtime.joinSession({ sessionId, localPeer });
}

export async function sendOutpostReady(
  runtime: MultiplayerRuntime,
  authorityPeerId: string,
  ready: boolean
): Promise<void> {
  await runtime.send({
    channel: "reliable",
    kind: "game.action",
    targetPeerIds: [authorityPeerId],
    payload: { type: "ready", ready }
  });
}

export function createOutpostSessionId(): string {
  return normalizeOutpostSessionId(`os-${createIdentitySuffix()}`);
}

export function normalizeOutpostSessionId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length < 4 || normalized.length > 32) {
    throw new Error("Squad code must contain 4–32 letters, numbers, or dashes.");
  }
  return normalized;
}

export function normalizeOutpostDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 16);
  return normalized.length > 0 ? normalized : "RANGER";
}

function createIdentitySuffix(): string {
  const source = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return source
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
