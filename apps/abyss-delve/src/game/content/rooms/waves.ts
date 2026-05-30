import type { AbyssContentEntry } from "../factories";
import { waveProfile } from "../factories";

export const abyssWaveEntries: AbyssContentEntry[] = [
  waveProfile({
    id: "wave.bootstrap",
    label: "Forsaken Antechamber Patrol",
    tier: "starter",
    roomKind: "combat",
    spawns: [
      { profileId: "enemy.melee", x: 600, y: 290 },
      { profileId: "enemy.ranged", x: 820, y: 220 },
      { profileId: "enemy.heavy", x: 810, y: 470 },
      { profileId: "enemy.melee", x: 510, y: 455 }
    ]
  }),
  waveProfile({
    id: "wave.elite",
    label: "Crimson Watch",
    tier: "elite",
    roomKind: "combat",
    spawns: [
      { profileId: "enemy.elite.warden", x: 760, y: 340 },
      { profileId: "enemy.ranged", x: 620, y: 250 },
      { profileId: "enemy.melee", x: 580, y: 430, count: 2 }
    ]
  })
];
