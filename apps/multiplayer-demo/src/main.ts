import "./styles.css";
import { createMultiplayerDemoClient, type MultiplayerDemoClient } from "./client";
import type { MultiplayerDemoCommand } from "./domain";
import {
  bindMultiplayerDemoControls,
  renderBootError,
  renderClientState,
  renderMultiplayerDemoShell,
  renderServerReady,
  renderSessionInfo,
  type MultiplayerDemoConfig,
  type MultiplayerDemoSessionInfo
} from "./ui";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app element");
}

void bootMultiplayerDemo(root).catch((error) => {
  renderBootError(root, error);
});

async function bootMultiplayerDemo(rootElement: HTMLElement): Promise<void> {
  const ui = renderMultiplayerDemoShell(rootElement);
  const config = await fetchConfig();
  let sessionInfo: MultiplayerDemoSessionInfo | undefined;
  let client: MultiplayerDemoClient | undefined;
  let clientSessionId: string | undefined;
  let busyLabel: string | undefined;
  let lastError: string | undefined;

  ui.roomInput.value = config.defaultSessionId;
  renderAll();
  ui.roomInput.addEventListener("input", renderAll);

  bindMultiplayerDemoControls(ui, {
    host() {
      void runAction("Hosting room", async () => {
        await hostRoom(readRoomId());
      });
    },
    connect() {
      void runAction("Connecting client", async () => {
        await connectClient(readRoomId());
      });
    },
    disconnect() {
      void runAction("Disconnecting client", async () => {
        await disconnectClient();
      });
    },
    reset() {
      void runAction("Resetting room", async () => {
        await resetRoom(readRoomId());
      });
    },
    command(command) {
      void runAction("Sending command", async () => {
        await sendCommand(command);
      });
    }
  });

  const refreshHandle = window.setInterval(async () => {
    if (!sessionInfo || busyLabel) {
      return;
    }

    try {
      sessionInfo = await fetchSessionInfo(sessionInfo.sessionId);
    } catch (error) {
      if (error instanceof DemoApiError && error.status === 404) {
        sessionInfo = undefined;
      } else {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    renderAll();
  }, 500);

  window.addEventListener("beforeunload", cleanupClient, { once: true });

  async function runAction(label: string, action: () => Promise<void>): Promise<void> {
    if (busyLabel) {
      return;
    }

    busyLabel = label;
    lastError = undefined;
    renderAll();

    try {
      await action();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(error);
    } finally {
      busyLabel = undefined;
      renderAll();
    }
  }

  function renderAll(): void {
    if (sessionInfo) {
      renderSessionInfo(ui, sessionInfo);
    } else {
      renderServerReady(ui, config);
    }

    const clientOptions =
      sessionInfo === undefined
        ? { busy: busyLabel !== undefined, selectedSessionId: readSelectedSessionId() }
        : {
            activeSessionId: sessionInfo.sessionId,
            busy: busyLabel !== undefined,
            selectedSessionId: readSelectedSessionId()
          };
    renderClientState(ui, client, clientOptions);

    if (busyLabel) {
      ui.status.textContent = busyLabel;
    } else if (lastError) {
      ui.status.textContent = lastError;
    }
  }

  function readRoomId(): string {
    return ui.roomInput.value;
  }

  function readSelectedSessionId(): string {
    return ui.roomInput.value.trim();
  }

  async function hostRoom(sessionId: string): Promise<MultiplayerDemoSessionInfo> {
    const response = await fetch("/api/multiplayer-demo/session", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });
    if (!response.ok) {
      throw await createApiError(response, "Unable to host multiplayer demo session");
    }

    sessionInfo = (await response.json()) as MultiplayerDemoSessionInfo;
    ui.roomInput.value = sessionInfo.sessionId;
    return sessionInfo;
  }

  async function loadHostedSession(sessionId: string): Promise<MultiplayerDemoSessionInfo> {
    sessionInfo = await fetchSessionInfo(sessionId);
    ui.roomInput.value = sessionInfo.sessionId;
    return sessionInfo;
  }

  async function connectClient(sessionId: string): Promise<void> {
    const hosted = await loadHostedSession(sessionId);
    if (client && client.runtime.phase() === "in-session" && clientSessionId === hosted.sessionId) {
      return;
    }

    await disposeClient();
    const nextClient = createMultiplayerDemoClient({
      endpoint: hosted.endpoint,
      roomName: hosted.roomName,
      sessionId: hosted.sessionId,
      hostPeerId: hosted.hostPeerId
    });
    try {
      await nextClient.connect();
      client = nextClient;
      clientSessionId = hosted.sessionId;
    } catch (error) {
      await nextClient.dispose();
      throw error;
    }
  }

  async function disconnectClient(): Promise<void> {
    await disposeClient();
    if (sessionInfo) {
      try {
        sessionInfo = await fetchSessionInfo(sessionInfo.sessionId);
      } catch (error) {
        if (error instanceof DemoApiError && error.status === 404) {
          sessionInfo = undefined;
        } else {
          throw error;
        }
      }
    }
  }

  async function sendCommand(command: MultiplayerDemoCommand): Promise<void> {
    if (!isClientConnectedToSelectedRoom()) {
      await connectClient(readRoomId());
    }

    await client?.sendCommand(command);
    if (sessionInfo) {
      sessionInfo = await fetchSessionInfo(sessionInfo.sessionId);
    }
  }

  async function resetRoom(sessionId: string): Promise<void> {
    const response = await fetch(
      `/api/multiplayer-demo/session?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: {
          accept: "application/json"
        }
      }
    );
    if (!response.ok) {
      throw await createApiError(response, "Unable to reset multiplayer demo session");
    }

    const result = (await response.json()) as { sessionId: string; disposed: boolean };
    if (clientSessionId === result.sessionId) {
      await disposeClient();
    }
    if (sessionInfo?.sessionId === result.sessionId) {
      sessionInfo = undefined;
    }
    ui.roomInput.value = result.sessionId;
  }

  async function disposeClient(): Promise<void> {
    const currentClient = client;
    client = undefined;
    clientSessionId = undefined;
    await currentClient?.dispose();
  }

  function cleanupClient(): void {
    window.clearInterval(refreshHandle);
    void disposeClient();
  }

  function isClientConnectedToSelectedRoom(): boolean {
    return (
      client?.runtime.phase() === "in-session" &&
      clientSessionId !== undefined &&
      sessionInfo?.sessionId === clientSessionId &&
      readSelectedSessionId() === clientSessionId
    );
  }
}

async function fetchConfig(): Promise<MultiplayerDemoConfig> {
  const response = await fetch("/api/multiplayer-demo/config", {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw await createApiError(response, "Unable to load multiplayer demo config");
  }

  return (await response.json()) as MultiplayerDemoConfig;
}

async function fetchSessionInfo(sessionId: string): Promise<MultiplayerDemoSessionInfo> {
  const response = await fetch(
    `/api/multiplayer-demo/session?sessionId=${encodeURIComponent(sessionId)}`,
    {
      headers: {
        accept: "application/json"
      }
    }
  );
  if (!response.ok) {
    throw await createApiError(response, "Unable to load multiplayer demo session");
  }

  return (await response.json()) as MultiplayerDemoSessionInfo;
}

class DemoApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function createApiError(response: Response, fallback: string): Promise<DemoApiError> {
  let message = `${fallback}: ${response.status}`;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      message = body.error;
    }
  } catch {
    // Keep the HTTP fallback when the dev server did not return a JSON problem body.
  }

  return new DemoApiError(message, response.status);
}
