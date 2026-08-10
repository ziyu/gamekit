import type { OutpostReplicatedWeaponState } from "../../domain";

export function WeaponHud({
  elapsedMs,
  weapon
}: {
  elapsedMs: number;
  weapon: OutpostReplicatedWeaponState | undefined;
}) {
  const reloadDuration =
    weapon?.reloadStartedAt === undefined || weapon.reloadEndsAt === undefined
      ? 0
      : weapon.reloadEndsAt - weapon.reloadStartedAt;
  const reloadProgress =
    weapon?.phase !== "reloading" || reloadDuration <= 0
      ? 0
      : Math.max(0, Math.min(1, (elapsedMs - (weapon.reloadStartedAt ?? 0)) / reloadDuration));
  const feedback =
    weapon?.lastFeedback !== undefined &&
    elapsedMs >= weapon.lastFeedback.at &&
    elapsedMs - weapon.lastFeedback.at <= 1_600
      ? weapon.lastFeedback
      : undefined;
  const status =
    weapon === undefined
      ? "SYNCING"
      : weapon.phase === "reloading"
        ? `RELOADING ${Math.round(reloadProgress * 100)}%`
        : weapon.phase === "empty"
          ? weapon.reserveAmmo > 0
            ? "EMPTY · RELOAD"
            : "NO AMMO"
          : "RIFLE READY";
  const feedbackLabel =
    feedback === undefined
      ? undefined
      : `${feedback.action === "rifle" ? "FIRE" : "RELOAD"} ${
          feedback.kind === "cancelled" ? "CANCELLED" : "DENIED"
        } · ${feedback.reason.replaceAll("-", " ").toUpperCase()}`;

  return (
    <section
      className={`outpost-weapon ${weapon?.phase === "reloading" ? "is-reloading" : ""}`}
      aria-label="Rifle ammunition"
    >
      <div>
        <span>MK-I SERVICE RIFLE</span>
        <kbd>R&nbsp; RELOAD</kbd>
      </div>
      <strong>{String(weapon?.magazine ?? 0).padStart(2, "0")}</strong>
      <small>/ {String(weapon?.reserveAmmo ?? 0).padStart(3, "0")}</small>
      <i>
        <b style={{ width: `${reloadProgress * 100}%` }} />
      </i>
      <em aria-live="polite">{feedbackLabel ?? status}</em>
    </section>
  );
}
