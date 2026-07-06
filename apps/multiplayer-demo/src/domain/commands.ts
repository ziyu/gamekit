export const MULTIPLAYER_DEMO_SCHEMA_VERSION = "multiplayer-demo.command.v1";
export const MULTIPLAYER_DEMO_COMMAND_KIND = "game.command";
export const MULTIPLAYER_DEMO_RESULT_KIND = "game.command.result";
export const MULTIPLAYER_DEMO_RELIABLE_CHANNEL = "reliable";

export type MultiplayerDemoStrategy = "gather" | "build" | "defend";

export type MultiplayerDemoCommand =
  | { type: "select"; objectId: string }
  | { type: "confirm"; objectId?: string }
  | { type: "set-strategy"; strategy: MultiplayerDemoStrategy }
  | { type: "set-priority"; objectId: string; priority: number };

export type MultiplayerDemoCommandPayload = {
  schemaVersion: typeof MULTIPLAYER_DEMO_SCHEMA_VERSION;
  command: MultiplayerDemoCommand;
};

export type MultiplayerDemoCommandResultPayload = {
  schemaVersion: typeof MULTIPLAYER_DEMO_SCHEMA_VERSION;
  commandId: string;
  status: "accepted";
  commandType: MultiplayerDemoCommand["type"];
  summary: {
    selectedObjectId?: string;
    strategy: MultiplayerDemoStrategy;
    confirmations: number;
    appliedCommands: number;
  };
};

export type MultiplayerDemoCommandDecodeResult =
  | { ok: true; command: MultiplayerDemoCommand }
  | { ok: false; code: string; reason: string };

export function createMultiplayerDemoCommandPayload(
  command: MultiplayerDemoCommand
): MultiplayerDemoCommandPayload {
  return {
    schemaVersion: MULTIPLAYER_DEMO_SCHEMA_VERSION,
    command
  };
}

export function decodeMultiplayerDemoCommand(payload: unknown): MultiplayerDemoCommandDecodeResult {
  if (!isRecord(payload)) {
    return reject("demo.payload.invalid", "Command payload must be an object.");
  }

  if (payload.schemaVersion !== MULTIPLAYER_DEMO_SCHEMA_VERSION) {
    return reject("demo.payload.schema", "Command payload schema version is not supported.");
  }

  const command = payload.command;
  if (!isRecord(command) || typeof command.type !== "string") {
    return reject("demo.command.invalid", "Command must include a type.");
  }

  switch (command.type) {
    case "select":
      return decodeObjectCommand(command);
    case "confirm":
      return decodeConfirmCommand(command);
    case "set-strategy":
      return decodeStrategyCommand(command);
    case "set-priority":
      return decodePriorityCommand(command);
    default:
      return reject("demo.command.unknown", `Unknown command type: ${command.type}`);
  }
}

function decodeObjectCommand(command: Record<string, unknown>): MultiplayerDemoCommandDecodeResult {
  if (typeof command.objectId !== "string" || command.objectId.length === 0) {
    return reject("demo.command.object", "Command requires a target object id.");
  }

  return {
    ok: true,
    command: {
      type: "select",
      objectId: command.objectId
    }
  };
}

function decodeConfirmCommand(
  command: Record<string, unknown>
): MultiplayerDemoCommandDecodeResult {
  if (command.objectId !== undefined && typeof command.objectId !== "string") {
    return reject("demo.command.object", "Confirm command object id must be a string.");
  }

  return {
    ok: true,
    command: {
      type: "confirm",
      ...(typeof command.objectId === "string" ? { objectId: command.objectId } : {})
    }
  };
}

function decodeStrategyCommand(
  command: Record<string, unknown>
): MultiplayerDemoCommandDecodeResult {
  if (
    command.strategy !== "gather" &&
    command.strategy !== "build" &&
    command.strategy !== "defend"
  ) {
    return reject("demo.command.strategy", "Strategy must be gather, build, or defend.");
  }

  return {
    ok: true,
    command: {
      type: "set-strategy",
      strategy: command.strategy
    }
  };
}

function decodePriorityCommand(
  command: Record<string, unknown>
): MultiplayerDemoCommandDecodeResult {
  if (typeof command.objectId !== "string" || command.objectId.length === 0) {
    return reject("demo.command.object", "Priority command requires a target object id.");
  }

  if (typeof command.priority !== "number" || !Number.isInteger(command.priority)) {
    return reject("demo.command.priority", "Priority command requires an integer priority.");
  }

  return {
    ok: true,
    command: {
      type: "set-priority",
      objectId: command.objectId,
      priority: command.priority
    }
  };
}

function reject(code: string, reason: string): MultiplayerDemoCommandDecodeResult {
  return {
    ok: false,
    code,
    reason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
