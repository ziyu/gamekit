import { MULTIPLAYER_DEMO_SESSION_ID } from "./create-local-demo-server";

const SESSION_ID_MAX_LENGTH = 48;

export function normalizeMultiplayerDemoSessionId(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const normalized = raw
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SESSION_ID_MAX_LENGTH);

  return normalized.length > 0 ? normalized : MULTIPLAYER_DEMO_SESSION_ID;
}
