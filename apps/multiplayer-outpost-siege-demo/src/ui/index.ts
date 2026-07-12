export type OutpostUiSnapshot = {
  phase:
    | "boot"
    | "lobby"
    | "countdown"
    | "wave"
    | "intermission"
    | "boss"
    | "extraction"
    | "results";
  waveIndex: number;
  sharedResource: number;
  objectiveId?: string | undefined;
};
