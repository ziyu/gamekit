export type AudioUnlockState = "locked" | "unlocking" | "unlocked" | "failed";
export type AudioOutputState = "running" | "suspended";

export type FadeOptions = {
  fadeMs?: number | undefined;
};
