import type { AbyssContentEntry } from "../factories";
import { gasActor, heroClass } from "../factories";

export const abyssHeroEntries: AbyssContentEntry[] = [
  gasActor(
    "actor.player",
    "Delver",
    160,
    100,
    ["tag.player"],
    ["ability.basic", "ability.firebolt", "ability.cleave"]
  ),
  heroClass({
    id: "hero.delver",
    label: "Delver",
    role: "starter",
    actorDefinitionId: "actor.player",
    renderObjectId: "abyss.render.player",
    spawn: { x: 210, y: 342 },
    speed: 230
  }),
  gasActor(
    "actor.player.warden",
    "Ember Warden",
    188,
    82,
    ["tag.player"],
    ["ability.basic", "ability.cleave"]
  ),
  heroClass({
    id: "hero.warden",
    label: "Ember Warden",
    role: "alternate",
    actorDefinitionId: "actor.player.warden",
    renderObjectId: "abyss.render.player.warden",
    spawn: { x: 210, y: 342 },
    speed: 204
  })
];
