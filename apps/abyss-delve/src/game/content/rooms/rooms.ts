import { ABYSS_ROOM_BOUNDS } from "../../constants";
import type { AbyssContentEntry } from "../factories";
import { roomTemplate } from "../factories";

export const abyssRoomEntries: AbyssContentEntry[] = [
  roomTemplate({
    id: "room.bootstrap",
    label: "Forsaken Antechamber",
    kind: "combat",
    heroClassId: "hero.delver",
    waveProfileId: "wave.bootstrap",
    rewardPoolId: "rewardPool.bootstrap",
    bounds: ABYSS_ROOM_BOUNDS
  }),
  roomTemplate({
    id: "room.elite-preview",
    label: "Crimson Watch Post",
    kind: "combat",
    heroClassId: "hero.delver",
    waveProfileId: "wave.elite",
    rewardPoolId: "rewardPool.elite",
    bounds: ABYSS_ROOM_BOUNDS
  }),
  roomTemplate({
    id: "room.reward-shrine",
    label: "Stillwater Shrine",
    kind: "reward",
    heroClassId: "hero.delver",
    rewardPoolId: "rewardPool.bootstrap",
    bounds: ABYSS_ROOM_BOUNDS
  })
];
