# Outpost Siege Gameplay Foundation

Status: Active.

## Goal

把 Outpost Siege 从“authority combat slice 已接线”推进为完整、坚实、可复用基础之上的可玩游戏。所有缺失的通用能力优先进入对应 Core/新 package，Outpost 只保留游戏内容、policy、encounter 和 presentation mapping。

长期玩法设计入口：`docs/apps/outpost-siege/README.md`。

重大边界决策：`docs/adr/0031-gameplay-foundation-packages-and-agent-ai.md`。

## Current Capability Audit

| 领域              | 已存在基础                                                                                 | 主要缺口                                                                          | 归属决策                                        |
| ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| World / identity  | Entity-backed actor/projectile/buildable、identity registry                                | 角色/武器/AI/animation component 尚不完整                                         | Outpost component + reusable module binding     |
| Physics           | Rapier 2D、layout、ray/shape/overlap query、fixed step、interpolation                      | Projectile 当前 app 手写 ray sweep；character/steering/attack shape 缺统一交付    | Physics 保持；交付进入 Combat                   |
| GAS               | Actor/attribute/tag/ability/effect/cooldown/cost/cue/trace；execution lifecycle 已实现     | 等待独立库评审通过后才能进入 Combat                                               | 扩展 `@gamekit/gas`                             |
| TCA               | Event index、condition/action、trace、once/save                                            | 无需新高频职责                                                                    | 继续只做低频反应/目标/phase                     |
| Combat            | `@gamekit/combat` 已具备通用 delivery、target policy、GAS hit 与 entity projectile runtime | Outpost 仍使用 app-local rifle/shock/turret/enemy attack，尚未迁移到通用 executor | 评审 Combat 后迁移 app                          |
| AI                | `nearestPlayer` + 直线 velocity + range overlap + GAS attack                               | 无感知、目标评分、task、telegraph、slot、预算、stuck recovery                     | 新增 `@gamekit/ai-core`                         |
| Navigation        | Physics obstacle，arena collider                                                           | 无 path/route、动态 blocker、cache、request budget；当前敌人会直线撞墙            | 新增 `@gamekit/navigation-core` + graph backend |
| Renderer          | RenderObject lifecycle、sprite/container、native state writer                              | Phaser 无 animated-sprite/clip registration/particle command；角色只是静态纹理    | 扩展 `renderer-phaser`                          |
| Animator          | Render definition 有 animation envelope、Phaser 有最小 `animation.play`                    | 无 graph/controller/layer/marker/phase/late-join restore/benchmark                | 新增 `@gamekit/animator-core`                   |
| Asset             | image/spritesheet type 与 AssetManager                                                     | Phaser loader 不支持 Core 已声明的 atlas/audio；缺 animation manifest workflow    | 扩展 Asset metadata + `driver-phaser`           |
| Audio             | Asset Core 有 `audio` type                                                                 | 无 Audio facade、loader/runtime、bus/voice/concurrency/cue mapping                | 新增 `@gamekit/audio-core` + Phaser slice       |
| Multiplayer       | Room authority、Schema、managed replication、prediction/playback                           | 未复制完整 ability phase、cue、match/AI/facility 状态                             | 扩展 app Schema；Core 只补通用 track/cue 缺口   |
| Match / encounter | 初始 3 enemy spawn 与 combat counters                                                      | 无完整 phase、director、boss、core、node、extraction、results                     | Outpost app-local                               |
| UI                | Lobby/HUD 基础与 DevTools shell                                                            | 无完整页面状态、world telegraph、build/protocol/revive/results                    | Outpost React/presentation，复用 UI Core        |

审计证据：

- `authority-combat.ts` 仍持有 Dash、Shock、Turret 常量与 ability switch，敌人使用 `nearestPlayer` 直线 steering。
- `renderer-phaser/object-factory.ts` 只声明 `debug.square`、`sprite`、`container`；command handler 只处理最小 `animation.play`。
- Phaser Driver asset loader 只支持 image/spritesheet，虽然 Asset Core 已声明 atlas/audio 类型。
- Combat package 已在本工作流中实现；仓库仍没有 AI、Navigation、Animator 或 Audio package。

## Required Package Work

### `@gamekit/gas` Ability Execution Extension

Deliverables:

- `GasAbilityExecutionDefinition/State/Result` 与稳定 execution id。
- `requested/preparing/committed/active/recovering/completed/cancelled` phase。
- Cost/cooldown commit policy、tag interrupt/cancel、phase event/cue/trace。
- Entity-backed hot state、handle query/cancel、save/restore。
- Instant ability 使用同一 contract 的兼容行为。
- Data validation、TCA definitions、DevTools summary。

Tests/bench:

- phase ordering、zero-duration、cancel before/after commit、cost/cooldown、duplicate request、actor removal、save restore。
- 扩展 `bench:gameplay` 覆盖 1,000 idle / active executions 与 trace disabled/enabled。

Gate:

- Outpost 不保留独立 ability timer；Abyss/fixture 使用同一 execution API 完成一个非战斗或不同战斗 ability。

Review checkpoint (2026-07-17):

- 已实现 execution definition/state/result、稳定 id/request dedupe、全 phase、commit/cancel/interrupt/concurrency policy、entity-backed active state、Handle/TCA/Save/trace 和旧即时 ability/checkpoint 兼容。
- 非战斗 fixture 使用 `ability.scan` 经过同一 execution contract 执行 progress effect；本 checkpoint 未修改 Outpost 或开始 Combat package。
- GAS 定向测试 30/30；全仓 `test` 73/73 tasks、`build` 40/40 tasks、`lint` 73/73 tasks 通过。全仓格式检查仅被本 checkpoint 开始前已存在的 `.claude/*`、`AGENTS.md`、`CLAUDE.md` 8 个范围外文件阻塞；GAS/基准/本文档相关文件格式检查通过。
- `bench:gameplay:check` 17/17 budgets 通过：1,000 idle actors 为 1.15 ms/tick，1,000 active executions 在 trace disabled/enabled 时分别为 4.14/3.97 ms/tick，recent execution 保留 256，dispose 后为 0。`bench:world` 同时通过：10,000 entities spawn/add 9.85 ms，5,000 moving entities query/update 5.66 ms。
- `bench:checkpoint:check` 7/7 budgets 通过：1,000 actors + 500 active effects + 500 active executions 捕获 0.97 ms/次、预校验并恢复 5.96 ms/次，恢复后仍保留 500 executions。
- 全仓首轮回归发现旧即时 Ability 的零时长 phase facts 会挤占 Abyss 有界 timeline；已收紧兼容语义为“内部使用统一 execution state/result，显式声明 execution 才对外发布完整 phase event/cue/trace”，Abyss 8 files / 17 tests 与最终全仓回归均通过。
- 评审门保持关闭：只有 GAS 包完整验证证据通过后，才开始下一个库。

### `@gamekit/combat`

Deliverables:

- Delivery request、relationship/target policy、stable candidate sorting。
- Direct/melee/hitscan/area/projectile executor。
- Entity-backed projectile、ray/shape sweep、hit ticket/memory、pierce/bounce/stop、lifetime/cleanup。
- GAS effect application、Physics/World identity mapping、trace/fact。
- GameModule/handle、DataTypes、memory/fake fixture、Save contributor。

Tests/bench:

- Friendly ignore、wall block、duplicate suppression、multi-hit、effect rejection、despawn race、stable ordering。
- 300/1,500 projectile 与 mass-hit/entity churn benchmark；dispose retained entity/map 为 0。

Gate:

- Outpost rifle、Shock、enemy melee、turret 都经同一 delivery executor；第二 fixture 使用 area/heal 或不同 relationship policy。

Review checkpoint (2026-07-17):

- 已实现 `@gamekit/combat`，公共协议不包含 Outpost、武器、角色、阵营或生命字段；effect 只通过 GAS 提交，空间候选只来自 Physics，projectile 是同一 World 中带标准 Physics component 的 entity。
- Direct、melee、hitscan、area、contact/ray-sweep/shape-sweep projectile 共用 relationship/candidate/hit pipeline；包含 stable sorting、body/collider → World entity fallback、hit ticket、bounded hit memory、stop/pierce/bounce、execution ownership、lifetime/bounds/despawn race cleanup。
- 已提供 DataTypes、trace/低频 fact、GameModule/Handle、Save contributor 和可复用 facade conformance；第二 fixture 使用 area heal + support relationship policy，未引入游戏专属枚举。
- Combat 定向测试 11/11 通过，覆盖 friendly ignore、wall block、stable ordering、direct/melee/area/hitscan、effect rejection、request/hit dedupe、pierce/bounce/contact/shape sweep、lifetime、despawn race、entity-mapped restore，以及真实 Koota + Rapier2D + GAS 模块组合。全仓 `test` 74/74 tasks、`build` 41/41 tasks、`lint` 74/74 tasks 通过；lint 仅回放两个范围外旧 warning。
- `bench:combat:check` 9/9 budgets 通过。300 moving projectiles 的 mean/p95/max 为 0.49/0.68/0.80 ms/tick；1,500 moving projectiles 为 3.17/3.96/4.95 ms/tick（2.11 µs/projectile-tick）；1,000 candidate mass hit 为 1.91 ms mean、3.35 ms p95；300 projectile spawn+cancel churn 为 4.78 ms mean、5.84 ms p95。所有 dispose retained entity/map 均为 0。
- `bench:world`、`bench:gameplay:check`、`bench:physics:check`、`bench:checkpoint:check` 同时通过。全仓格式检查仍只被本 checkpoint 开始前已有的 `.claude/*`、`AGENTS.md`、`CLAUDE.md` 8 个范围外文件阻塞；Combat、benchmark、模块设计和本文档的 scoped format 通过。
- 本 checkpoint 按单库评审门停止，不迁移 Outpost，也不开始 Navigation/AI/Animator/Audio。Outpost migration gate 仍保持关闭，待本库评审通过后进入下一步。

### `@gamekit/navigation-core` + Graph Backend

Deliverables:

- NavigationWorld/Handle、agent profile、project/path/route request、revision、cancel、snapshot/trace。
- Authored graph backend、goal-keyed reverse route field、dynamic edge blocker/cost、cache/negative cache。
- Request scheduler budget、stable result ordering、layout DataType/content validator。
- Physics/Renderer-independent memory conformance。

Third-party gate:

- 用 Outpost graph profile 对比窄自有 graph backend 与 Yuka graph/search adapter 的 build size、1,000 agent route sample、dynamic invalidation、allocation 与 deterministic result。
- 只有 Yuka 算法 slice 明显优于且不引入 `GameEntity/Vehicle/World` 语义时才建立 `navigation-yuka` adapter；不让 Yuka 成为 agent runtime owner。

Tests/bench:

- Required path、projection、unreachable、cancel、revision、partial invalidation、cache limit、burst fairness。
- 250/1,000 agent route sample、buildable blocker churn、dispose retained state。

### `@gamekit/ai-core`

Deliverables:

- Agent binding、sensor/perception fact、bounded memory/blackboard。
- Utility consideration/curve、goal selector、hysteresis/commit/cooldown。
- Task executor lifecycle、interrupt/failure/timeout/backoff、intent sink。
- Deterministic budget scheduler、LOD class、trace/snapshot/save。
- DataTypes 与 definition registry；memory fixture/conformance。

Tests/bench:

- Score breakdown、tie-break、switch threshold、target invalid、task cancel、ability reject、path failure、agent removal。
- 250 normal / 1,000 mixed-LOD agent，记录 perception/decision/task/path span、最大单 tick spike 与 retained state。

Gate:

- Raider/Gunner/Saboteur/Brute 只注册 data/consideration/task，不各自复制 update loop。
- 不引入 per-agent GOAP、XState actor 或 Yuka GameEntity；未来 planner 只通过 `AiPlanner` adapter。

### `@gamekit/animator-core`

Deliverables:

- Clip/graph/binding DataTypes、parameter、state、layer、transition、one-shot、marker。
- Controller GameModule、dirty update/batch frame、trace/snapshot/reset。
- Gameplay execution phase mapping、late join/current phase rebuild、local anticipation/cancel。
- Backend-neutral AnimationPlaybackAdapter + memory conformance。

Phaser work:

- Driver loader 支持 atlas、spritesheet manifest。
- Renderer 支持 animated-sprite、native clip creation/binding、particle emitter/command。
- 同一 Phaser runtime/cache，不创建独立 Scene/Game。

Tests/bench:

- State/transition/layer/interrupt、marker dedupe、phase seek、generation reset、missing clip fallback。
- 500 active / 1,000 idle controller、backend batch write、dispose retained state。

### `@gamekit/audio-core`

Deliverables:

- AudioAdapter、bus、listener、voice/source、play/stop/set command。
- Priority/concurrency/voice stealing、spatial source、snapshot/diagnostics。
- Memory/null adapter 与 conformance。
- Phaser Driver audio loader/cache/sound manager slice、browser unlock mapping。

Tests/bench:

- Bus/mute、play/stop、loop ownership、concurrency、dedupe、unlock failure、entity despawn。
- Rifle/cue burst、spatial batch update、voice retained state。

Gate:

- Headless profile 可验证 semantic AudioCommand 而不需要浏览器；gameplay 不读取 playback success。

## Existing Package Extensions

| Package               | Required extension                                                                    | 禁止做法                                 |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `@gamekit/asset`      | Atlas/audio/animation manifest metadata、variant/source validation                    | 加入 Phaser frame/native sound           |
| `driver-phaser`       | Atlas/audio loader、shared animation/audio runtime slice、diagnostics                 | 新建第二个 Phaser.Game/Scene/cache       |
| `renderer-phaser`     | Animated sprite、clip binding、particle command、batch state writer                   | 把 gameplay animation state写进 adapter  |
| `@gamekit/app-host`   | Combat/AI/Navigation/Animator 的薄 standard GameModule resolve；Audio service binding | 在 Host 内实现 domain runtime            |
| `multiplayer-core`    | 仅在现有 managed replication 无法表达 phase/cue generation reset 时补通用协议         | 添加 Outpost Schema/ability/enemy 字段   |
| `@gamekit/devtools`   | 新 domain source/correlation summary 与 profiler span registration                    | 让 trace observer 参与 gameplay decision |
| `@gamekit/test-utils` | 新 facade conformance helper所需 memory fixtures                                      | 测试工具依赖 Outpost app                 |

## Outpost App Refactor

Required module layout:

```txt
src/
  content/
    definitions/
    arena/
    manifests/
  domain/
    identity/
    match/
    replication/
  gameplay/
    match-flow/
    player/
    encounters/
    objectives/
    economy/
    construction/
    ai-definitions/
    combat-policies/
  presentation/
    animation/
    cues/
    world-ui/
    render-sync/
  realtime/
  ui/
  test/
```

Migration removes:

- `authority-combat.ts` 中 ability id switch、通用 projectile sweep、damage/shield、straight-line enemy loop。
- App presentation 中 animation timer/native clip 特判。
- 与 Multiplayer Core managed replication 重复的 interpolation/prediction/reconciliation call。
- HUD 内 framework diagnostics。

Outpost retains:

- Data definitions、relationship/damage policy。
- Match/encounter/objective/economy/construction rules。
- Enemy role consideration/task definitions、boss phase rules。
- App Schema/projection、cue mapping、UI view model 与 game UI。

## Delivery Order

### Slice 1: Ability + Combat Foundation

Depends on: existing GAS/Physics/World/Data.

Work:

1. GAS execution lifecycle + migration compatibility。
2. Combat package direct/melee/area/projectile。
3. Outpost rifle/reload/dash/shock/enemy attack/turret migrate。
4. Combat trace、replication phase/hit projection 与 benchmark。

Exit evidence:

- Headless rifle/reload/dash/skill/enemy combat 无 app-local 通用 delivery duplicate。
- Real two-client movement + full weapon/skill feedback。
- GAS/Combat conformance、build/lint、gameplay/authority benchmark。

### Slice 2: Animator + Asset + Audio

Depends on: Slice 1 stable execution phase.

Work:

1. Animator Core + memory adapter。
2. Phaser atlas/animated sprite/particle path。
3. Audio Core + Phaser adapter/unlock。
4. Ranger/Raider 完整 idle/run/fire/reload/dash/hit/death first content set。
5. Cue presentation mapping、late join/reconnect phase restore。

Exit evidence:

- Gameplay timing 不读取 marker。
- Real browser local/remote animation、audio、particle、reduced-motion smoke。
- 500 controller / cue burst benchmark 与 asset group failure/retry。

### Slice 3: Navigation + AI

Depends on: stable Combat ability intent and arena instance data.

Work:

1. Navigation Core/graph backend + Frontier route layout。
2. AI Core utility/task/scheduler。
3. Raider/Gunner/Saboteur/Brute data/tasks、attack slots、stuck recovery。
4. Boss phase task set。
5. AI/Navigation DevTools source 与 benchmark。

Exit evidence:

- 敌人可绕开静态物体、响应 Barricade、不会直线撞墙或集体占一个目标点。
- 250 normal / 1,000 stress agent budget 无无界 path/trace/memory。
- Fixed-seed AI snapshot、save restore 与 two-client telegraph/attack smoke。

### Slice 4: Match, Encounters, Economy

Depends on: Combat/AI/Navigation complete.

Work:

1. Match Flow state machine、core/node objective。
2. Three encounter waves、Director、boss phase、extraction。
3. Shared Supply、facility、repair、protocol vote、results summary。
4. Checkpoint contributor 与 deterministic continuation。

Exit evidence:

- 1/2/4 player headless full match 可胜/可败且不会卡 phase。
- Supply transaction/duplicate reward/path-preserving placement/boss fallback 测试。
- Checkpoint benchmark 与 equivalence。

### Slice 5: Complete Multiplayer UI

Depends on: stable full match projection.

Work:

1. Title/Join、Lobby/loadout、Loading/Deployment。
2. Match/world HUD、build、revive、protocol、reconnect、results。
3. Late join、grace/reconnect、leader transfer、rematch。
4. Responsive portrait/narrow landscape、controller flow、accessibility。

Exit evidence:

- Single/two/four browser full match E2E。
- Portrait viewport camera/HUD、scope/focus、reduced-motion、controller path。
- No framework diagnostics in HUD；DevTools retains correlated full chain。

### Slice 6: Quality And Soak Closure

Depends on: all previous slices.

Work:

1. Normal/stress benchmark baselines and budgets。
2. 60-minute soak、multi-room、reconnect/entity/cue churn。
3. Full asset failure/retry、dispose retained-state audit。
4. Manual playability matrix and UX defect closure。
5. Second-scenario package validation and public API review。

Exit evidence:

- `test/build/lint/format`、World/Physics/Gameplay/Multiplayer/Outpost benchmarks。
- Normal profile frame/tick budgets、bounded queues/history、zero retained session resources。
- Long-term docs align with final public protocol；execution record can close。

## Dependency DAG

```txt
GAS execution ─┬─> Combat ───────────┬─> Outpost combat content
               │                     ├─> AI task ability execution
               │                     └─> Match encounter results
               └─> Animator phase ──> Phaser animation/cue

Arena data ───────> Navigation ──────> AI ───────> Encounter Director

Asset/Driver ─────> Animator + Audio ───────────> Complete presentation

All gameplay state ─> App Schema/Managed Replication ─> UI/E2E/Soak
```

Slices cannot be inverted by adding app-local substitutes. For example, AI slice不能先写第二个 straight-line/animation timer 并承诺以后迁移；发现底层 protocol 缺口先修对应 package。

## Review Gates

Each slice review checks:

- Core-first：是否复用对应 core runtime/factory/helper，而非结构兼容替身。
- Genericity：公共类型是否包含 Outpost 业务名或假设。
- Lifecycle：install/start/stop/dispose/reset/reconnect/save 是否成套。
- Performance：热点是否 batch/index/cache，有无硬上限与 benchmark。
- Explainability：稳定 error/trace/correlation 是否覆盖拒绝和异常路径。
- Real validation：headless contract 之外是否有 Rapier/Colyseus/Phaser/Browser 真实验证。
- Documentation：长期模块/app 文档与 implementation evidence 职责是否清晰。
