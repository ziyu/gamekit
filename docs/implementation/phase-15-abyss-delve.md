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

| Agent | 类型     | 任务                                      | 状态      | 结果                                       |
| ----- | -------- | ----------------------------------------- | --------- | ------------------------------------------ |
| Locke | explorer | Phase 15 文档职责、一致性和旧示例残留审查 | Completed | 发现 4 个必改边界问题，已进入 P15.0 rework |

后续每个实现任务应至少有一个子 Agent 参与实现、审查或验证。子 Agent 的写入范围必须和主线任务错开，避免互相覆盖。

## 任务拆分总览

| ID     | 任务                          | 产出                                                                | 状态        | 提交   |
| ------ | ----------------------------- | ------------------------------------------------------------------- | ----------- | ------ |
| P15.0  | Phase 15 设计落地与任务拆分   | 应用设计、阶段路线、实现文档                                        | In Progress | 待提交 |
| P15.1  | 应用脚手架与 App Host profile | `apps/abyss-delve` 可启动空壳、host/profile/test harness            | Planned     | -      |
| P15.2  | 内容模型与首批 DataPack       | 自定义 DataType、hero/enemy/room/loot/render/asset/rule 内容        | Planned     | -      |
| P15.3  | World 组件与基础运行时模块    | actor、movement、combat intent、room、loot、presentation components | Planned     | -      |
| P15.4  | 玩家控制与相机                | input binding、player movement、aim、dodge、camera follow/lookahead | Planned     | -      |
| P15.5  | GAS 战斗链路                  | basic attack、两个主动技能、damage/effect/tag/cue                   | Planned     | -      |
| P15.6  | 怪物 AI 与房间波次            | enemy spawn、AI、hit/death、room completion                         | Planned     | -      |
| P15.7  | TCA 掉落与奖励循环            | actor.died -> loot roll -> pickup -> reward choice                  | Planned     | -      |
| P15.8  | Renderer 表现垂直切片         | player/enemy/projectile/loot/room 复合 RenderObject 和 sync         | Planned     | -      |
| P15.9  | React UI 游戏壳               | HUD、skill bar、loot prompt、reward modal、inventory/run summary    | Planned     | -      |
| P15.10 | Save / Load 集成              | meta progression、run checkpoint、contributors、restore 测试        | Planned     | -      |
| P15.11 | DevTools 集成                 | actor/loot/room source、trace chain、performance profiler           | Planned     | -      |
| P15.12 | 长链路测试与浏览器 smoke      | headless scenarios、browser smoke、边界检查                         | Planned     | -      |
| P15.13 | 阶段收口审查                  | 完整验证、合理性检查、质量检查、文档状态更新                        | Planned     | -      |

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

待提交。

## P15.1：应用脚手架与 App Host profile

### 当前任务实现计划

待 P15.0 提交后补充。预期包括：

- 新增 `apps/abyss-delve` package、Vite/TS 配置、HTML 入口。
- 使用 App Host `GameAppDefinition + AppProfile` 启动标准服务。
- 接入 Phaser Driver、memory/headless test profile、React UI shell、DevTools preset。
- 建立 `apps/abyss-delve/src/test/abyss-harness.ts`。
- 添加 app 边界测试：不直接 import Phaser/Koota/DOM/React 到 game modules。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.2：内容模型与首批 DataPack

### 当前任务实现计划

待 P15.1 完成后补充。预期包括：

- 定义 Abyss 自定义 DataType。
- 建立内容目录：heroes、enemies、rooms、loot、abilities、effects、visuals、rules。
- 首批内容至少包含 1 hero、3 enemies、1 elite/boss、2 room templates、3 loot categories。
- 所有内容通过 `entries[]` DataPack 注册，支持 reference graph。

### Review 记录

待实现。

### 提交记录

待实现。

## P15.3：World 组件与基础运行时模块

### 当前任务实现计划

待实现。

预期组件：

- `AbyssActor`
- `Transform2D`
- `Velocity2D`
- `CombatState`
- `AbilityIntent`
- `Hitbox`
- `ProjectileState`
- `RoomState`
- `LootState`
- `PresentationState`

预期模块：

- dungeon-room
- combat
- loot
- presentation
- ui-bridge

### Review 记录

待实现。

### 提交记录

待实现。

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
