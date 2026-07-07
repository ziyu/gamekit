import {
  createLocalMultiplayerDemoHost,
  MULTIPLAYER_DEMO_ROOM_NAME,
  type LocalMultiplayerDemoHost
} from "./create-local-demo-server";

export type MultiplayerDemoSessionRegistryOptions = {
  endpoint: string;
  roomName?: string;
};

export type MultiplayerDemoHostSessionResult = {
  session: LocalMultiplayerDemoHost;
  created: boolean;
};

export type MultiplayerDemoSessionRegistry = {
  sessionIds(): string[];
  hosts(): LocalMultiplayerDemoHost[];
  getSession(sessionId: string): LocalMultiplayerDemoHost | undefined;
  getHostOwnerId(sessionId: string): string | undefined;
  hostSession(sessionId: string, hostOwnerId: string): Promise<MultiplayerDemoHostSessionResult>;
  closeSession(sessionId: string): Promise<boolean>;
  dispose(): Promise<void>;
};

type MultiplayerDemoSessionRecord = {
  session: LocalMultiplayerDemoHost;
  hostOwnerId: string;
};

export class MultiplayerDemoSessionConflictError extends Error {
  constructor(
    readonly sessionId: string,
    readonly hostOwnerId: string
  ) {
    super(`Session is already hosted by another window: ${sessionId}`);
  }
}

export function createMultiplayerDemoSessionRegistry(
  options: MultiplayerDemoSessionRegistryOptions
): MultiplayerDemoSessionRegistry {
  const roomName = options.roomName ?? MULTIPLAYER_DEMO_ROOM_NAME;
  const sessions = new Map<string, MultiplayerDemoSessionRecord>();
  const pendingSessions = new Map<string, Promise<MultiplayerDemoSessionRecord>>();

  return {
    sessionIds() {
      return [...sessions.keys()];
    },
    hosts() {
      return [...sessions.values()].map((record) => record.session);
    },
    getSession(sessionId) {
      return sessions.get(sessionId)?.session;
    },
    getHostOwnerId(sessionId) {
      return sessions.get(sessionId)?.hostOwnerId;
    },
    async hostSession(sessionId, hostOwnerId) {
      const current = sessions.get(sessionId);
      if (current) {
        assertSessionOwner(sessionId, current.hostOwnerId, hostOwnerId);
        return {
          session: current.session,
          created: false
        };
      }

      const pending = pendingSessions.get(sessionId);
      if (pending) {
        const record = await pending;
        assertSessionOwner(sessionId, record.hostOwnerId, hostOwnerId);
        return {
          session: record.session,
          created: false
        };
      }

      const created = createLocalMultiplayerDemoHost({
        endpoint: options.endpoint,
        roomName,
        sessionId
      }).then((session) => {
        const record = { session, hostOwnerId };
        sessions.set(sessionId, record);
        return record;
      });
      pendingSessions.set(sessionId, created);

      try {
        return {
          session: (await created).session,
          created: true
        };
      } finally {
        pendingSessions.delete(sessionId);
      }
    },
    async closeSession(sessionId) {
      const record = sessions.get(sessionId);
      if (record) {
        sessions.delete(sessionId);
        await record.session.dispose();
        return true;
      }

      const pending = pendingSessions.get(sessionId);
      if (!pending) {
        return false;
      }

      const created = await pending;
      sessions.delete(sessionId);
      pendingSessions.delete(sessionId);
      await created.session.dispose();
      return true;
    },
    async dispose() {
      const allSessions = new Set([...sessions.values()].map((record) => record.session));
      const pending = [...pendingSessions.values()];
      sessions.clear();
      pendingSessions.clear();
      const settled = await Promise.allSettled(pending);
      for (const result of settled) {
        if (result.status === "fulfilled") {
          allSessions.add(result.value.session);
        }
      }
      await Promise.all([...allSessions].map((session) => session.dispose()));
    }
  };
}

function assertSessionOwner(sessionId: string, expected: string, actual: string): void {
  if (expected !== actual) {
    throw new MultiplayerDemoSessionConflictError(sessionId, actual);
  }
}
