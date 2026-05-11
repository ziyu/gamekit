# Hero Road 示例游戏设计

## 定位

Hero Road 是用于验证 GameKit 全架构的真实小 demo，不是 sandbox。Sandbox 只验证框架切片；Hero Road 用于证明 DataPack、TCA、GAS、Renderer、Input、Camera、UI、Save、DevTools 能组合成游戏。

## 游戏概念

2D 俯视角格子地图游戏：

- 玩家给英雄铺路。
- 英雄自动沿道路前进。
- 路过地形、建筑、怪物巢穴时触发随机事件。
- 怪物达到数量后出兵。
- 英雄通过 GAS 拥有属性、词条、能力和状态。

## 建议目录

```txt
apps/hero-road/src/
  main.tsx
  App.tsx

  game/
    create-game.ts
    modules/
      hero-road-module.ts
      grid-module.ts
      road-module.ts
      hero-module.ts
      monster-module.ts
      building-module.ts
      random-event-module.ts
      ui-module.ts

    data/
      assets/
      render-objects/
      actors/
      abilities/
      effects/
      terrain/
      roads/
      buildings/
      events/
      rules/
      index.ts

    ecs/
      components.ts
      systems/

    ui/
      windows/
      Hud.tsx
      register-windows.ts

    renderer/
      create-phaser-renderer.ts
```

## 核心验证点

- DataPack 启动游戏。
- Hero Actor 引用 render object，不直接写 sprite。
- Basic Attack Ability 通过 GAS/TCA 执行。
- Forest Ambush Event 通过 TCA 触发。
- Input Action 驱动铺路和镜头控制。
- CameraController 控制格子地图镜头。
- Event Log / Actor Detail / TCA Trace 可查看。
- Save/Load 能恢复基础状态。

## 示例 Actor 方向

```ts
export const guardianHero = defineActor({
  id: "actor.hero.guardian",
  name: "守路英雄",
  tags: ["actor", "actor.hero", "actor.melee", "hero.trait.guardian"],
  presentation: {
    renderObject: "render.actor.hero.guardian",
    portrait: { assetId: "portrait.hero.guardian" }
  },
  attributes: {
    hp: 30,
    maxHp: 30,
    attack: 5,
    defense: 2,
    speed: 1,
    courage: 5
  },
  abilities: ["ability.basic-attack", "ability.hero-rest"]
});
```

## 示例随机事件方向

Forest Ambush：

- trigger：hero.enter_tile
- conditions：tile.has_tag forest、actor.has_tag hero
- actions：monster.spawn、ui.show_toast、cue.play

该事件应能在 DevTools 中看到完整 TCA trace。
