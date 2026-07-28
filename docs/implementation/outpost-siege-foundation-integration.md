# Outpost Siege Foundation Integration

Status: Paused.

玩家操作、角色、武器、复制和表现的后续重做由
[`outpost-siege-player-experience-rebuild.md`](./outpost-siege-player-experience-rebuild.md) 接管。本工作流停在
`1fc7189`，保留底层模块统一接入的历史与验收矩阵，不在这里继续追加玩家体验切片。

## Goal

把已经完成评审的 Combat、AI、Navigation、Animator、Asset 与 Audio 能力统一接入
Outpost Siege 正式 authority/client 链路，删除 app 内同职责替代实现，并以真实
Rapier、Colyseus、Phaser 和浏览器行为证明模块协作成立。

长期应用合同见 [`../apps/multiplayer-outpost-siege-demo.md`](../apps/multiplayer-outpost-siege-demo.md)，
敌人行为见 [`../apps/outpost-siege/characters-and-ai.md`](../apps/outpost-siege/characters-and-ai.md)，
表现合同见 [`../apps/outpost-siege/animation-and-feedback.md`](../apps/outpost-siege/animation-and-feedback.md)。

## Current Integration State

2026-07-27 已完成第一条统一运行链路：

- Outpost DataPack 已注册 Combat、Navigation Graph、AI、Animator 和 Audio definitions，enemy
  archetype 显式引用 `ai.agent`。
- authority 已使用同一份 World、Rapier Physics、GAS、Combat Core、Navigation Graph、AI 和
  TCA runtime；rifle projectile、shock area 与 enemy melee 均通过 GAS execution + Combat
  delivery 结算。
- Raider 已经过 sensor → utility goal → route field → movement intent → telegraph → GAS action
  → recover；arena 四组 barricade 从 placement source 派生 blocker mapping，并通过 revision
  使依赖 route stale。
- Colyseus Schema 只复制 target、goal、task phase、ability execution/phase 与 generation；AI
  blackboard、utility score、route topology 和 trace 保持 server-only。
- Browser client 已通过 Phaser Driver animation adapter 创建 Animator controller；locomotion
  参数连续更新，late join 按 authority elapsed 恢复当前 phase。Audio 已进入 App Host 标准
  service，music、rifle 和 enemy telegraph 使用有界并发、dedupe 与空间 emitter/listener。
- Headless authority DevTools 已暴露 Combat、GAS、TCA、Navigation、AI 和 correlation 摘要；
  Browser DevTools 已暴露复制 Combat/AI 语义、Animator 和标准 Audio source。

仍未关闭本工作流：角色动画资源当前只是单帧 spritesheet contract fixture，Gunner、Saboteur、
Brute 与 Overseer 的专属 goal/task、attack slot、stuck recovery、完整 cue/VFX/Camera feedback、
authority checkpoint 以及最终 browser/soak/performance budget 仍需按正式单局内容继续实现。

## Integration Invariants

- 同一 authority session 只创建一份 World、Physics、GAS、Combat、Navigation、AI 与 TCA runtime。
- AI 只输出 movement/aim/action/navigation intent；它不能直接写伤害、冷却、资源或复制状态。
- Navigation 只返回 projection、route 和 progress；最终速度由 Outpost steering policy 写入 Physics。
- GAS execution phase 是 Combat delivery、Animator、Audio 与 cue presentation 的共同语义时钟。
- Combat Core 负责候选、relationship、hit ticket、projectile 和 GAS payload 交付；Outpost 只保留队伍、伤害、击退和内容 policy。
- 客户端只接收 gameplay-visible target、task phase、ability execution、cue 与 transform，不接收 blackboard、utility score、route topology 或完整 trace。
- AssetManager 负责资源加载状态，Phaser Driver 复用同一 cache/runtime 执行 Renderer、Animator 与 Audio adapter。
- 所有 trace/history/request/route/marker/playback/cue 队列都使用有界配置，并在 session dispose 后归零。

## Authority Module Order

一次权威 tick 固定为：

```txt
participant and player input materialization
  -> enemy lifecycle and AI binding
  -> Navigation request processing
  -> arena blocker revision synchronization
  -> AI perception, decision and task update
  -> movement / aim / action intent application
  -> player command / AI action activates GAS
  -> GAS execution phase advance
  -> Physics fixed step
  -> Combat ability-delivery, projectile and contact resolution
  -> TCA reactions and death cleanup
  -> authority snapshot and Colyseus Schema projection
```

模块安装顺序和行为顺序由 authority integration test 锁定。允许一次 path request 在下一 tick
完成，但不允许一次 AI action 在同 tick 绕过 GAS/Combat 直接结算。

## Content Contract

Outpost core DataPack 统一注册并交叉校验：

- GAS attribute/tag/cue/effect/ability/actor。
- Combat relationship policy、delivery、projectile 与 ability-delivery binding。
- Navigation graph/layout/agent profile。
- AI sensor/task/goal/agent definition。
- Animation clip/graph/binding。
- Audio music/SFX/dialogue/mix catalog 所引用的 AssetRef。
- Physics、RenderObject、arena、player、enemy、weapon、buildable、wave、objective 与 TCA rule。

`outpost.enemy` 必须显式引用 `ai.agent`，arena authoring 必须从同一 placement source 派生
Physics layout 和 Navigation graph/blocker mapping。DataRegistry 改动单独审查，因为 Browser、
Headless、Tauri、deterministic test 和全部 Outpost benchmark 都依赖同一注册入口。

## Migration Boundaries

本工作流删除以下 app-local 替代职责：

- 敌人每 tick `nearestPlayer` 直线追逐和范围内直接 `applyDamage`。
- rifle projectile 的 app-local entity/sweep/hit-memory/lifetime 实现。
- shock/敌人攻击各自手写 Physics query + effect delivery。
- 客户端以 transform/tag 特判代替 Animator controller 的播放状态。
- gameplay callback 直接操作 native audio channel。

Outpost 继续拥有：

- 玩家与敌人队伍关系、伤害/护盾公式、击退、攻击槽和 stuck recovery policy。
- Raider/Gunner/Saboteur/Brute/Overseer 的 consideration、task 和 authored route 语义。
- cue 到动画、粒子、音频、镜头和 UI 的 presentation mapping。
- app-owned Colyseus Schema、authority projection、client decoder 和 UI view model。

## Delivery Slices

### 1. Data And Combat

- 注册 Combat/AI/Navigation/Animator DataTypes 和 Outpost definitions。
- 让 rifle、shock、enemy attack 与 turret 共用 GAS execution + Combat delivery。
- 复制公开 execution/task/target/cue state，删除 app-local projectile/hit resolution。

### 2. Navigation And AI

- 从 arena source 建立 Frontier graph、agent profile 和动态 barricade mapping。
- bind/unbind 敌人 agent；Raider 先经过完整 acquire/route/move/telegraph/commit/recover。
- 接入 shared route field、攻击槽、path failure backoff、stuck recovery 和 scheduler class。

### 3. Presentation

- Phaser Driver 的 Animator playback adapter 绑定动态 RenderObject。
- presentation frame 批量写 locomotion parameter，并从复制的 execution/task phase 恢复 one-shot。
- Audio service 使用 Outpost catalog；cue mapping 驱动 Music/SFX，空间 emitter 跟随 presentation frame。

### 4. Closure

- DevTools 注册 Combat/Navigation/AI/Animator/Audio source 和 correlation summary。
- 补 deterministic、Rapier、room/two-client、browser 与 benchmark 证据。
- 删除迁移完成后的旧组件、计数器和测试 fixture；关闭本文档时迁移长期结论。

## Current Evidence

| Boundary       | Automated evidence                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Content        | One reference graph contains Combat/Navigation/AI/Animator/Audio and profile service graph includes Audio                            |
| Combat         | Rifle kill correlation crosses Combat/GAS/TCA; shock preparation precedes area delivery; enemy task waits for accepted GAS execution |
| Navigation     | Arena barricade mapping advances revision; unblock → dependent route → reblock makes route explicitly stale                          |
| AI             | Fixed-seed authority test observes staged enemy attack and physical pursuit through real NavigationHandle                            |
| Multiplayer    | Colyseus v3 round-trip retains public AI/GAS semantics and rejects server-only state from the projection                             |
| Animator/Audio | Memory adapters prove phase seek, locomotion controller ownership, SFX dedupe and symmetric dispose                                  |
| Profiles       | Browser build uses Phaser animation/audio slices; headless/deterministic profiles use memory Audio backend                           |

当前应用级回归为 37 tests。这里记录的是本工作流证据，不替代下方最终性能与 E2E 验收矩阵。

## Acceptance Matrix

| 链路        | 必须证明                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------- |
| Combat      | AI/玩家只能经 GAS + Combat 造成结果；hit ticket 不重复；projectile dispose 为零留存           |
| Navigation  | Raider 绕开 arena collider；route revision/失败有界；barricade 更新使旧 route stale           |
| AI          | 固定 seed 下目标与 task phase 可复现；取消/死亡/超时释放 route 与攻击槽                       |
| Multiplayer | 两客户端看到一致 target、telegraph、commit 和 death；不包含 server-only AI state              |
| Animator    | locomotion 不 reset；late join 从当前 phase seek；generation reset 清理 marker/one-shot       |
| Asset/Audio | preload/lazy/retry 可诊断；unlock 失败不影响 gameplay；owner/emitter dispose 对称             |
| Performance | 250 normal / 1,000 stress agent、500 active animator 和 combat burst 均通过预算               |
| Lifecycle   | stop/dispose/reconnect 后 agent、route、projectile、controller、emitter 和 trace 均有界或归零 |

## Validation Commands

```bash
corepack pnpm --filter multiplayer-outpost-siege-demo test
corepack pnpm --filter multiplayer-outpost-siege-demo build
corepack pnpm bench:outpost:content:check
corepack pnpm bench:outpost:authority:check
corepack pnpm bench:outpost:client:check
corepack pnpm bench:outpost:profiles:check
corepack pnpm bench:ai:check
corepack pnpm bench:navigation:check
corepack pnpm bench:animator:check
corepack pnpm bench:audio:check
corepack pnpm bench:world
corepack pnpm test
corepack pnpm build
corepack pnpm lint
corepack pnpm format
```
