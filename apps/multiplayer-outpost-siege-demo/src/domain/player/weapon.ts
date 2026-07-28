export type OutpostReplicatedWeaponFeedback = {
  sequence: number;
  kind: "rejected" | "cancelled";
  action: "rifle" | "reload";
  reason: string;
  at: number;
  correlationId?: string | undefined;
};

export type OutpostReplicatedWeaponState = {
  weaponId: string;
  magazine: number;
  magazineSize: number;
  reserveAmmo: number;
  phase: "ready" | "reloading" | "empty";
  shotSequence: number;
  lastShotCorrelationId?: string | undefined;
  reloadStartedAt?: number | undefined;
  reloadEndsAt?: number | undefined;
  reloadRequestId?: string | undefined;
  reloadCorrelationId?: string | undefined;
  lastFeedback?: OutpostReplicatedWeaponFeedback | undefined;
};
