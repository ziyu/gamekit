import type { AiAgentReadContext } from "../contracts/agent-context";
import type { AiSensorDefinition } from "../definition/sensor-definition";
import type { AiPerceptionFact } from "./perception-fact";

export type AiSensorSampler = {
  id: string;
  sample(context: AiAgentReadContext, definition: AiSensorDefinition): AiPerceptionFact[];
};
