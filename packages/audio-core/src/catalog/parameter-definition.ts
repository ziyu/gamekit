import type { AudioParameterId } from "../contracts/identifiers";

export type AudioParameterValue = number | string | boolean;

export type AudioParameterDefinition =
  | {
      id: AudioParameterId;
      scope: "global" | "instance";
      kind: "continuous";
      defaultValue: number;
      min: number;
      max: number;
    }
  | {
      id: AudioParameterId;
      scope: "global" | "instance";
      kind: "discrete";
      defaultValue: string;
      values: string[];
    }
  | {
      id: AudioParameterId;
      scope: "global" | "instance";
      kind: "boolean";
      defaultValue: boolean;
    };
