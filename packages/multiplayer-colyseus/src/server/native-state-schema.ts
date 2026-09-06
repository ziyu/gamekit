import { schema, type SchemaType } from "@colyseus/schema";

export type GameKitColyseusNativeStateMessage = {
  sessionId: string;
  sourcePeerId: string;
  tick: number;
  version: string;
  timestamp: number;
  stateJson: string;
};

export const GameKitColyseusNativeState = schema({
  sessionId: "string",
  sourcePeerId: "string",
  tick: "number",
  version: "string",
  timestamp: "number",
  stateJson: "string",
  stateBytes: "number",
  updateCount: "number"
});

export type GameKitColyseusNativeState = SchemaType<typeof GameKitColyseusNativeState>;
