# Phase 15 实现文档：Abyss Delve 游戏验证应用

本文件记录 Phase 15 的执行任务、逐任务开发流程、review 记录和验收证据。Abyss Delve 的长期应用设计见 `../apps/abyss-delve.md`；阶段路线和完成定义见 `../development-stages.md`。

## 阶段目标

实现一个常见俯视角肉鸽暗黑-like 小型游戏应用，用真实游戏项目方式验证 GameKit 全链路组合能力。

本阶段必须验证：

- App Host 声明式启动真实 app。
- DataPack 驱动 hero、enemy、ability、effect、room、loot、render、asset、TCA rule。
- GameModule 拆分承载玩家控制、房间、战斗、掉落、表现、UI bridge 和 save contributor。
- GAS 承载 actor / ability / effect / tag 语义。
- TCA 承载 actor died、room completed、loot picked、reward selected 等低频规则。
- Renderer / Input / Camera / UI / Save / DevTools 以真实游戏方式协作。
- Headless runtime 测试和浏览器 smoke 验收都可执行。

## 阶段边界

本阶段不做：

- 玩法创新、复杂剧情、联网、排行榜、商业化。
- 完整编辑器或 Content Package System。
- 大规模美术资源生产。
- 把 Abyss Delve 的职业、怪物、掉落、房间或 UI 术语上推到 `packages/` 公共协议。

## 子 Agent 记录

| Agent       | 类型     | 任务                                      | 状态      | 结果                                                                |
| ----------- | -------- | ----------------------------------------- | --------- | ------------------------------------------------------------------- |
| Locke       | explorer | Phase 15 文档职责、一致性和旧示例残留审查 | Completed | 发现 4 个必改边界问题，已进入 P15.0 rework                          |
| Helmholtz   | explorer | P15.1 playable room slice 只读实现审查    | Completed | 建议复用 Driver/App Host 边界，新增长链路和 gameplay 依赖扫描       |
| Kierkegaard | explorer | P15.2 内容模型和 DataPack 深化边界审查    | Completed | 确认当前处于中间态，指出内容拆分、引用图、runtime 迁移和测试缺口    |
| Aristotle   | explorer | P15.3 战斗和 GAS 深化边界审查             | Completed | 指出 ability 自伤、返回值缺失、cooldown 时间源和 GAS/World 同步风险 |

后续每个实现任务应至少有一个子 Agent 参与实现、审查或验证。子 Agent 的写入范围必须和主线任务错开，避免互相覆盖。

## 任务拆分总览

| ID     | 任务                         | 产出                                                              | 状态      | 提交    |
| ------ | ---------------------------- | ----------------------------------------------------------------- | --------- | ------- |
| P15.0  | Phase 15 设计落地与任务拆分  | 应用设计、阶段路线、实现文档                                      | Completed | 5fe749c |
| P15.1  | Playable Room Vertical Slice | 可玩的第一房间：移动、攻击、敌人、掉落、奖励、HUD、DevTools trace | Completed | 4c76049 |
| P15.2  | 内容模型扩展和 DataPack 深化 | 更多 hero/enemy/room/loot/reward 内容，引用图和内容验证           | Completed | c36da17 |
| P15.3  | 战斗和 GAS 深化              | 技能成本、冷却、buff/debuff、更多 cue、actor inspector            | Completed | 待提交  |
| P15.4  | 房间推进和 Save checkpoint   | 多房间推进、run checkpoint、meta progression、load 恢复           | Planned   | -       |
| P15.5  | 表现质量和 Camera            | 更完整复合 RenderObject、camera follow/lookahead/shake            | Planned   | -       |
| P15.6  | DevTools 和长链路验收        | input -> damage -> death -> loot -> reward trace、browser smoke   | Planned   | -       |
| P15.7  | 阶段收口审查                 | 完整验证、合理性检查、质量检查、文档状态更新                      | Planned   | -       |
| P15.12 | 长链路测试与浏览器 smoke     | headless scenarios、browser smoke、边界检查                       | Planned   | -       |
| P15.13 | 阶段收口审查                 | 完整验证、合理性检查、质量检查、文档状态更新                      | Planned   | -       |

## 垂直链路执行顺序

Phase 15 不按“先完整战斗、再补数据、最后补工具”的方式推进。每个任务都必须让可测试链路更完整，避免把真实游戏内容硬编码进系统。

推荐顺序：

1. 先建立 app shell、headless harness 和边界测试。
2. 再落 DataType / DataPack / reference graph，让内容先有来源。
3. 然后建立最小 actor + room runtime，所有系统消费数据和 component。
4. 第一条战斗链路就接入 input trace、GAS effect、TCA event 和 DevTools trace。
5. loot/item 模型一稳定就接最小 save contributor，不等 UI 完整后再补。
6. UI 与 Input scope 早测，reward modal、inventory、DevTools pin 都必须阻断 gameplay action。

## 逐任务流程

每个任务必须按以下流程执行：

1. 在本文件对应任务段落补充“当前任务实现计划”。
2. 分配子 Agent：实现、审查或验证至少一种。
3. 执行开发，保持文件职责拆分。
4. 自审是否满足任务目标，写入 review 记录。
5. 补测试或调整已有测试。
6. 跑任务相关测试；阶段边界任务必须跑完整验证。
7. 若 review 或测试失败，状态改为 `Rework`，回到第 1 步。
8. 通过后提交本任务代码，并记录 commit。

## P15.0：Phase 15 设计落地与任务拆分

### 当前任务实现计划

- 新增 Abyss Delve 应用长期设计文档。
- 从旧示例迁移到 Abyss Delve 命名和设计。
- 删除错误归属在 `docs/modules/` 下的 app 设计文档。
- 更新阶段路线和架构索引。
- 建立本阶段实现文档和任务拆分。
- 开启子 Agent 做文档一致性审查。

### Review 记录

| 检查项                                     | 结果   | 记录                                                       |
| ------------------------------------------ | ------ | ---------------------------------------------------------- |
| 应用长期设计是否放在 `docs/apps/`          | Passed | `docs/apps/abyss-delve.md` 已新增                          |
| app 玩法是否从模块文档移除                 | Passed | 旧 app 设计文档已从 `docs/modules/` 移除                   |
| Phase 15 路线是否更新                      | Passed | `docs/development-stages.md` 已改为 Abyss Delve            |
| 旧示例文档引用是否清理                     | Passed | 子 Agent 反馈后已清理实现文档措辞                          |
| `renderer-phaser` 归属是否一致             | Passed | 子 Agent 指出 architecture 缺少包结构归属，已补充          |
| app 文档是否混入阶段措辞                   | Passed | 子 Agent 指出“首个/首轮/一开始”等措辞，已改为长期规格      |
| collision / projectile 边界是否清晰        | Passed | 已补充 app-local World component + math/spatial query 边界 |
| Abyss 专属 DevTools inspector 归属是否清晰 | Passed | 已补充 app-specific source / panel 说明                    |
| 子 Agent 是否参与                          | Passed | Locke 已完成只读审查                                       |
| 测试是否覆盖本任务影响                     | Passed | `corepack pnpm --filter @gamekit/core test` 通过           |
| 格式是否通过                               | Passed | `corepack pnpm format` 通过                                |

### 提交记录

5fe749c

## P15.1：Playable Room Vertical Slice

### 当前任务实现计划

本任务必须让 `apps/abyss-delve` 第一屏成为可玩的俯视角暗黑-like 房间，而不是框架服务面板。

实现任务：

1. 清理上一版空壳实现。
   - 删除未提交的 `apps/abyss-delve` 空壳。
   - 回滚上一版为启动空壳新增的 root config / lockfile / 状态文档改动。
2. 新增真实游戏 app skeleton。
   - `apps/abyss-delve` 仍使用 Vite + React + App Host。
   - 页面主视觉是 Phaser canvas + 游戏 HUD，不展示 service list。
   - Web profile 通过 Phaser Driver 提供 renderer / asset / input capability。
3. 建立内容驱动的第一房间。
   - DataPack 定义 hero、3 类 enemy、room、loot table、reward、render object、GAS actor/effect/ability、TCA rule。
   - 首屏固定 seed 生成一个 combat room。
4. 建立 gameplay World components 和 modules。
   - 组件覆盖 position、velocity、actor、combat、hitbox、projectile、loot、room、presentation、floating text。
   - 模块覆盖 player control、enemy AI、combat/hit detection、loot/reward、presentation sync、ui bridge。
5. 完成核心交互。
   - WASD 移动、鼠标瞄准、左键普攻、右键技能、`1` 技能、`Space` 闪避、`E` 拾取、`I` 背包、`Esc` 暂停。
   - 奖励面板、背包、暂停、DevTools 聚焦时阻断 gameplay input。
6. 完成视觉反馈。
   - 玩家和敌人用复合 RenderObject，不使用圆点。
   - 攻击预警、投射物、命中、伤害数字、血条、死亡、掉落和拾取提示可见。
7. 完成 UI 和 DevTools。
   - HUD 显示生命、能量、金币、房间目标、技能冷却。
   - 三选一奖励 modal 影响角色状态。
   - DevTools 默认只 pin Performance，完整 DevTools 可查看 Abyss runtime snapshot 和 trace。
8. 测试和验收。
   - Headless harness 能跑一条 kill -> loot -> pickup -> reward 链路。
   - 浏览器 smoke 验证 3 秒内可见玩家、敌人、HUD、房间目标和 canvas。
   - 边界测试禁止 gameplay 直接 import Phaser、React、DOM、Koota、App Host 内部。

### Review 记录

| 检查项                                                   | 结果   | 记录                                                                                                  |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| 子 Agent 是否参与                                        | Passed | Helmholtz 已完成只读审查                                                                              |
| 第一屏是否是游戏场景而不是服务面板                       | Passed | Browser smoke 看到 Phaser canvas、HUD、房间目标、DevTools Performance pin                             |
| 玩家移动/攻击/闪避是否可用                               | Passed | InputRouter 注册 WASD、mouse aim、LMB/RMB、`1`、`Space`、`E`、`I`、`Esc`，headless 链路覆盖攻击和拾取 |
| 三类敌人和掉落/奖励是否可见                              | Passed | DataPack 定义 melee/ranged/heavy、gold/gear/blessing、三选一 reward                                   |
| Data/GAS/TCA/Renderer/Input/UI/DevTools 是否进入同一链路 | Passed | `abyss-long-chain.test.ts` 覆盖 kill -> loot -> pickup -> reward，DevTools 注册 Abyss runtime source  |
| gameplay 依赖边界是否通过扫描                            | Passed | `abyss-boundary.test.ts` 禁止 gameplay import Phaser/React/DOM/Koota/App Host 等外部 runtime          |
| 测试与浏览器 smoke 是否通过                              | Passed | `corepack pnpm --filter abyss-delve test`、`build` 通过；Browser smoke canvasCount=1                  |

### 提交记录

4c76049

## P15.2：内容模型与首批 DataPack

### 当前任务实现计划

本任务把 P15.1 的单文件内容原型升级成真实项目可维护的内容模型。目标不是扩大玩法复杂度，而是证明 Abyss Delve 可以按业务领域组织内容，同时 DataRegistry 能验证跨类型引用，runtime 仍从 DataPack 消费内容。

实现任务：

1. 拆分内容目录。
   - 将 `game/content/pack.ts` 中的业务内容拆到 `heroes/`、`enemies/`、`rooms/`、`loot/`、`rewards/`、`abilities/`、`visuals/`、`rules/`。
   - 每个业务文件可以混合自定义 DataType、GAS、TCA、RenderObject、Asset reference，不按 DataType 大表维护。
   - `pack.ts` 只负责组合 entries 和导出 `abyssDataPack`。
2. 深化自定义 DataType。
   - 保留并完善 `abyss.heroClass`、`abyss.enemyProfile`、`abyss.roomTemplate`、`abyss.lootTable`、`abyss.reward`。
   - 新增 `abyss.itemBase`、`abyss.itemAffix`、`abyss.waveProfile`、`abyss.rewardPool`。
   - DataType definitions 必须提供 validate / references / indexes，不能只是 required id。
3. 扩充首批内容。
   - 至少 2 个 hero class definition，其中当前 playable hero 继续是默认。
   - 至少 4 个 enemy profile，其中 1 个 elite/boss-like profile。
   - 至少 2 个 room template：combat room 和 reward room / exit room placeholder。
   - 至少 3 类 loot 和 3 个 item base / affix 示例，掉落能引用 item base 或 reward。
   - 至少 1 个 wave profile 被 room template 引用。
4. 引用图和内容验证。
   - hero 引用 GAS actor 和 render object。
   - enemy 引用 GAS actor、render object、loot table。
   - room 引用 hero、wave profile 和 reward pool。
   - wave 引用 enemy profile。
   - loot table 引用 item base、reward 或 render object。
   - DataRegistry 缺失引用错误要能在测试中被证明。
5. Runtime 消费迁移。
   - `room-module` 不再直接依赖 room.enemies 内联 spawn 列表；改为读取 room -> waveProfile -> enemy entries。
   - reward choices 从 reward pool 或 reward documents 读取，保持 P15.1 playable room 行为不倒退。
   - snapshot / DevTools source 至少能展示 contentSummary：types、documents、references、activeRoom、activeWave。
6. 测试和验收。
   - 新增 content registry 测试：DataType 注册、DataPack documents、reference graph、custom indexes。
   - 新增 missing reference 测试，证明内容错误能被 DataRegistry 拦截。
   - 更新长链路测试，确保拆分内容后 kill -> loot -> pickup -> reward 仍通过。
   - 边界测试继续禁止 gameplay 直接 import Phaser/React/DOM/Koota/App Host。

### Review 记录

| 检查项                                                         | 结果   | 记录                                                                    |
| -------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| 子 Agent 是否参与                                              | Passed | Kierkegaard 已完成只读审查，缺口已进入本任务实现                        |
| 内容是否按业务目录拆分                                         | Passed | 内容已拆到 abilities/heroes/enemies/rooms/loot/rewards/visuals/rules    |
| DataType 是否包含 validate / references / indexes              | Passed | hero/enemy/wave/room/loot/item/reward/rewardPool 均有验证和引用入口     |
| 首批 hero/enemy/room/loot/reward/wave/item 内容是否足够        | Passed | 2 hero、4 enemy、3 room、2 wave、3 item base、3 affix、2 reward pool    |
| Runtime 是否通过 DataRegistry 消费 wave/reward/content summary | Passed | room-module 读取 room -> wave，reward choices 读取 rewardPool           |
| 引用图和缺失引用测试是否覆盖                                   | Passed | `abyss-content-registry.test.ts` 覆盖 references、indexes、missing ref  |
| 长链路、边界、构建、格式是否通过                               | Passed | `test`、`build`、`lint`、`format` 已通过，Browser smoke 看到 canvas/HUD |

### 提交记录

c36da17

## P15.3：战斗和 GAS 深化

### 当前任务实现计划

本任务在 P15.1 可玩战斗和 P15.2 内容模型之上，修正当前“技能激活、GAS effect、World combat 表现”之间的语义缝隙。目标是让技能成本、冷却、命中效果、持续效果、状态 tag、cue 和 actor inspector 都能在同一条链路中被验证。

实现任务：

1. 修正技能激活语义。
   - `ability.firebolt` 和 `ability.cleave` 激活只负责成本、冷却、cue，不再把伤害 effect 施加到 player self。
   - combat module 不再用“energy 是否变化”推断技能是否成功，改成读取 GAS trace / cooldown 结果的显式 helper。
   - basic attack、firebolt、cleave 都必须 respect GAS cooldown 和 cost rejected trace。
2. 增加 buff / debuff / periodic effect。
   - 新增 GAS tag / cue：burning、exposed、guarded、cast、impact。
   - firebolt 命中造成直接伤害并施加 burning periodic damage。
   - cleave 命中造成伤害并施加 exposed debuff tag。
   - dodge 或防御窗口可以通过 guarded tag 表示，但不要把 dodge 重写成完整 GAS ability。
3. 同步 GAS 和 World combat。
   - combat system 每 tick 把 GAS attributes/effects/tags 同步到 World `Combat` / snapshot，确保 periodic damage 能反映到血量、死亡、浮字和 loot 链路。
   - 不能让 Renderer 或 React 参与命中判定。
4. 增加 actor inspector snapshot。
   - `AbyssSnapshot` 增加轻量 actor inspector 数据：actorId、entityId、attributes、tags、activeEffects、abilities/cooldowns。
   - DevTools/runtime source 可消费 snapshot，不新增长期框架 package。
5. 测试和验收。
   - 新增/更新 headless 测试：firebolt/cleave 不自伤，成本和冷却会 reject，burning periodic damage 会同步到 World，actor inspector 能看到 tag/effect/cooldown。
   - 长链路 kill -> loot -> pickup -> reward 不倒退。
   - 边界测试继续禁止 gameplay 直接 import Phaser/React/DOM/Koota/App Host。

### Review 记录

| 检查项                                                 | 结果   | 记录                                                                           |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| 子 Agent 是否参与                                      | Passed | Aristotle 已完成只读审查                                                       |
| 技能激活是否与命中 effect 解耦                         | Passed | firebolt/cleave activation 只负责 cost/cooldown/cue，命中后再 apply effect     |
| cost/cooldown/rejected trace 是否可验证                | Passed | GAS `activateAbility` 返回 activated/rejected result，测试覆盖 cooldown reject |
| burning/exposed/guarded 等 tag/effect/cue 是否进入链路 | Passed | 新增 burning/exposed/guarded tag/effect/cue，firebolt/cleave 链路已验证        |
| GAS periodic effect 是否同步 World combat 和 death     | Passed | combat tick 同步 GAS attributes/effects/tags 到 World/snapshot                 |
| Actor inspector snapshot 是否足够轻量                  | Passed | snapshot 暴露 attributes、tags、activeEffects、abilities/cooldowns             |
| 长链路、边界、构建、格式是否通过                       | Passed | `test`、`build`、`lint`、`format` 已通过                                       |

### 提交记录

待提交。

## P15.4：玩家控制与相机

### 当前任务实现计划

待实现。

预期覆盖：

- WASD movement。
- mouse aim。
- left click basic attack。
- right click secondary skill。
- number skills。
- space dodge。
- E pickup/interact。
- camera follow player + lookahead + shake。
- UI/DevTools focus scope gate。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.5：GAS 战斗链路

### 当前任务实现计划

待实现。

预期覆盖：

- player basic attack。
- fireball 或等价远程技能。
- dash slash 或等价位移技能。
- damage/heal/dot/slow/stun/shield effects。
- cue trace 和 renderer presentation event。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.6：怪物 AI 与房间波次

### 当前任务实现计划

待实现。

预期覆盖：

- 3 类普通怪物行为差异。
- 1 个 elite/boss。
- wave profile spawn。
- aggro、chase、attack telegraph、death。
- room completion condition。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.7：TCA 掉落与奖励循环

### 当前任务实现计划

待实现。

预期链路：

- actor.died -> loot roll。
- loot.picked -> currency/item/equipment state。
- room.completed -> reward choices。
- reward.selected -> blessing/effect 应用。
- DevTools 可解释 loot table、roll、affix、effect。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.8：Renderer 表现垂直切片

### 当前任务实现计划

待实现。

预期表现：

- player body / weapon / shadow / aim indicator / status ring。
- monster body / health bar / elite outline / telegraph。
- projectile travel / impact。
- loot beam / rarity color / pickup pulse。
- room floor / wall / gate / spawn marker。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.9：React UI 游戏壳

### 当前任务实现计划

待实现。

预期 UI：

- HUD。
- skill bar。
- loot pickup prompt。
- reward choice modal。
- inventory / equipment panel。
- run map / room progress。
- pause menu。
- run summary。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.10：Save / Load 集成

### 当前任务实现计划

待实现。

预期保存：

- meta progression。
- run checkpoint。
- seed、room state、player state、equipment、inventory、blessings。

不保存：

- renderer handles。
- React component state。
- transient input state。
- particles/floating text。
- DevTools tab/pin state。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.11：DevTools 集成

### 当前任务实现计划

待实现。

预期 source / panel：

- Actor detail。
- Room state。
- Loot roll。
- Inventory/equipment。
- Run checkpoint。
- TCA/GAS trace。
- Performance profiler。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.12：长链路测试与浏览器 smoke

### 当前任务实现计划

待实现。

预期测试：

- boot chain。
- combat chain。
- loot chain。
- room chain。
- save chain。
- devtools chain。
- focus/input boundary。
- content reference boundary。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.13：阶段收口审查

### 当前任务实现计划

待实现。

阶段完成前必须检查：

- Phase 15 完成定义逐条有证据。
- 所有 P15.x 任务达到 `Committed`。
- 子 Agent review 问题已关闭或记录到后续阶段。
- `corepack pnpm test` 通过。
- `corepack pnpm build` 通过。
- `corepack pnpm lint` 通过。
- `corepack pnpm format` 通过。
- 涉及前端 app 已浏览器 smoke。
- 核心实现目标和合理性检查通过。
- 代码质量检查通过。

### Review 记录

待实现。

### 提交记录

待实现。
